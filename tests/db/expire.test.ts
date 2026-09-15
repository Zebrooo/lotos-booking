import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { testDb, truncateAll, seedClinic } from "./helpers";
import type { Sql } from "@/lib/db/client";
import { holdSlot } from "@/lib/usecases/hold";
import { createPayment } from "@/lib/usecases/payment";
import { expireHolds } from "@/lib/usecases/expire";
import { createFakePaymentProvider } from "@/adapters/payment-fake";
import { localTime } from "@/domain/time";

let sql: Sql;
beforeAll(() => { sql = testDb(); });
afterAll(async () => { await sql.end(); });
beforeEach(async () => { await truncateAll(sql); });

const payment = createFakePaymentProvider({ baseUrl: "http://localhost:3000", secret: "s" });
const patient = { fullName: "Иванов Иван Иванович", birthDate: "1980-01-01", phone: "+79000000001", email: "ivanov@example.com" };
const at = (iso: string) => ({ now: () => new Date(iso) });

describe("expireHolds", () => {
  it("снимает просроченные удержания, освобождает ресурсы и закрывает платёж; свежие не трогает", async () => {
    const s = await seedClinic(sql);
    const clock = at("2026-09-14T06:00:00Z");
    const stale = await holdSlot(sql, clock, { serviceId: s.consultId, doctorId: s.doctorId, startsAt: localTime("2026-09-15", 600), patient, consentIds: s.consentIds });
    await createPayment(sql, { payment, clock }, { token: stale.token, returnUrl: "http://x/r" });
    const fresh = await holdSlot(sql, at("2026-09-14T06:14:00Z"), { serviceId: s.consultId, doctorId: s.doctorId, startsAt: localTime("2026-09-15", 900), patient: { ...patient, phone: "+79000000002" }, consentIds: s.consentIds });
    expect(await expireHolds(sql, at("2026-09-14T06:16:00Z"))).toBe(1);
    const rows = await sql<{ id: number; status: string }[]>`select id, status from bookings order by id`;
    expect(rows).toEqual([{ id: stale.bookingId, status: "expired" }, { id: fresh.bookingId, status: "held" }]);
    const active = await sql<{ bookingId: number }[]>`select booking_id from booking_resources where active`;
    expect(active).toEqual([{ bookingId: fresh.bookingId }]);
    const [p] = await sql<{ status: string }[]>`select status from payments`;
    expect(p!.status).toBe("expired");
    // Освобождённое окно можно занять снова.
    await expect(holdSlot(sql, at("2026-09-14T06:16:00Z"), { serviceId: s.consultId, doctorId: s.doctorId, startsAt: localTime("2026-09-15", 600), patient: { ...patient, phone: "+79000000003" }, consentIds: s.consentIds })).resolves.toBeTruthy();
    expect(await expireHolds(sql, at("2026-09-14T06:16:00Z"))).toBe(0);
  });
});
