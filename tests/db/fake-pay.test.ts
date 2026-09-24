import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { testDb, truncateAll, seedClinic } from "./helpers";
import type { Sql } from "@/lib/db/client";
import { holdSlot } from "@/lib/usecases/hold";
import { createPayment } from "@/lib/usecases/payment";
import { payWithFake } from "@/lib/usecases/fake-pay";
import { createFakePaymentProvider } from "@/adapters/payment-fake";
import { localTime } from "@/domain/time";

let sql: Sql;
beforeAll(() => { sql = testDb(); });
afterAll(async () => { await sql.end(); });
beforeEach(async () => { await truncateAll(sql); });

const clock = { now: () => new Date("2026-09-14T06:00:00Z") };
const fake = createFakePaymentProvider({ baseUrl: "http://localhost:3000", secret: "dev" });

describe("payWithFake", () => {
  it("оплата подтверждает запись и возвращает токен; отказ оставляет удержание; чужой платёж — 404", async () => {
    const s = await seedClinic(sql);
    const h = await holdSlot(sql, clock, { serviceId: s.consultId, doctorId: s.doctorId, startsAt: localTime("2026-09-17", 600),
      patient: { fullName: "Иванов Иван Иванович", birthDate: "1980-01-01", phone: "+79000000001", email: "ivanov@example.com" }, consentIds: s.consentIds });
    const { paymentId } = await createPayment(sql, { payment: fake, clock }, { token: h.token, returnUrl: "http://x" });
    expect(await payWithFake(sql, clock, fake, "dev", `fake-${paymentId}`, "failed")).toEqual({ token: h.token, status: 200 });
    const [held] = await sql<{ status: string }[]>`select status from bookings`;
    expect(held!.status).toBe("held");
    const again = await createPayment(sql, { payment: fake, clock }, { token: h.token, returnUrl: "http://x" });
    expect(await payWithFake(sql, clock, fake, "dev", `fake-${again.paymentId}`, "paid")).toEqual({ token: h.token, status: 200 });
    const [done] = await sql<{ status: string }[]>`select status from bookings`;
    expect(done!.status).toBe("confirmed");
    expect(await payWithFake(sql, clock, fake, "dev", "fake-999", "paid")).toEqual({ token: null, status: 404 });
  });
});
