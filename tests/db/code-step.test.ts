import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { testDb, truncateAll, seedClinic } from "./helpers";
import type { Sql } from "@/lib/db/client";
import type { SmsSender } from "@/ports/sms";
import { startBooking } from "@/lib/usecases/start-booking";
import { abandonHold, codeStep } from "@/lib/usecases/code-step";
import { localTime } from "@/domain/time";

let sql: Sql;
beforeAll(() => { sql = testDb(); });
afterAll(async () => { await sql.end(); });
beforeEach(async () => { await truncateAll(sql); });

const now = new Date("2026-09-14T06:00:00Z");
const clock = { now: () => now };
const sms: SmsSender = { name: "x", send: async () => ({ ok: true, messageId: "1" }) };
const form = { fio: "Смирнова Мария Игоревна", dob: "02.06.2017", phone: "+7 900 123-45-67", repFio: "Смирнова Елена Андреевна", phone2: "" };

async function started() {
  const s = await seedClinic(sql);
  const r = await startBooking(sql, { sms, clock, pepper: "t", siteUrl: "http://x", genCode: () => "2604" }, {
    serviceId: s.consultId, doctorId: s.doctorId, startsAt: localTime("2026-09-17", 600), who: "child", form,
    consentPd: true, consentPrepay: true, payChoice: "reserve" });
  if (!r.ok) throw new Error("старт не удался");
  return { s, token: r.token };
}

describe("шаг кода", () => {
  it("данные для страницы кода: телефон в маске, срок повтора, куда вернуться, черновик формы", async () => {
    const { s, token } = await started();
    const c = await codeStep(sql, clock, token);
    expect(c).toMatchObject({
      status: "held", payMode: "reserve", phoneMasked: "+7 900 123-45-67", doctorId: s.doctorId, serviceId: s.consultId,
      prefill: { who: "child", payChoice: "reserve", form: { fio: "Смирнова Мария Игоревна", dob: "02.06.2017", phone: "+7 900 123-45-67", repFio: "Смирнова Елена Андреевна", phone2: "" } },
    });
    expect(c!.resendAt.toISOString()).toBe("2026-09-14T06:01:00.000Z");
    expect(await codeStep(sql, clock, "нет-такого")).toBeNull();
  });

  it("«Изменить номер»: удержание снято без уведомлений, окно свободно; подтверждённую запись так не бросить", async () => {
    const { token } = await started();
    expect(await abandonHold(sql, token)).toBe(true);
    const [b] = await sql<{ status: string }[]>`select status from bookings`;
    expect(b!.status).toBe("expired");
    expect(await sql`select 1 from booking_resources where active`).toHaveLength(0);
    expect(await sql`select 1 from notifications`).toHaveLength(0);
    await sql`update bookings set status = 'confirmed', phone_verified_at = now()`;
    expect(await abandonHold(sql, token)).toBe(false);
  });
});
