import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { testDb, truncateAll, seedClinic } from "./helpers";
import type { Sql } from "@/lib/db/client";
import { holdSlot } from "@/lib/usecases/hold";
import { createPayment, applyPaymentNotification, ledgerRows } from "@/lib/usecases/payment";
import { markDone, markNoShow } from "@/lib/usecases/outcome";
import { createFakePaymentProvider } from "@/adapters/payment-fake";
import { localTime } from "@/domain/time";

let sql: Sql;
beforeAll(() => { sql = testDb(); });
afterAll(async () => { await sql.end(); });
beforeEach(async () => { await truncateAll(sql); });

const payment = createFakePaymentProvider({ baseUrl: "http://localhost:3000", secret: "s" });
const patient = { fullName: "Иванов Иван Иванович", birthDate: "1980-01-01", phone: "+79000000001", email: "ivanov@example.com" };
const at = (iso: string) => ({ now: () => new Date(iso) });

async function paid() {
  const s = await seedClinic(sql);
  const clock = at("2026-09-14T06:00:00Z");
  const h = await holdSlot(sql, clock, { serviceId: s.consultId, doctorId: s.doctorId, startsAt: localTime("2026-09-17", 600), patient, consentIds: s.consentIds });
  const { paymentId } = await createPayment(sql, { payment, clock }, { token: h.token, returnUrl: "http://x/r" });
  await applyPaymentNotification(sql, clock, { provider: "fake", notification: { externalId: `fake-${paymentId}`, status: "paid", amountKopecks: 40000, raw: {} } });
  return { s, h };
}

describe("итог приёма", () => {
  it("состоялся: зачёт аванса и чек зачёта", async () => {
    const { h } = await paid();
    await markDone(sql, at("2026-09-17T05:40:00Z"), h.bookingId);
    const [b] = await sql<{ status: string }[]>`select status from bookings where id = ${h.bookingId}`;
    expect(b!.status).toBe("done");
    expect(await ledgerRows(sql, h.bookingId)).toEqual([{ kind: "advance", amountKopecks: 40000 }, { kind: "settle", amountKopecks: 40000 }]);
    const receipts = await sql<{ kind: string }[]>`select kind from receipts where booking_id = ${h.bookingId} order by id`;
    expect(receipts.map(r => r.kind)).toEqual(["advance", "settle"]);
  });
  it("неявка: удержание без чека; повторно — bad_status", async () => {
    const { h } = await paid();
    await markNoShow(sql, at("2026-09-17T06:00:00Z"), h.bookingId);
    expect(await ledgerRows(sql, h.bookingId)).toEqual([{ kind: "advance", amountKopecks: 40000 }, { kind: "retain", amountKopecks: 40000 }]);
    await expect(markDone(sql, at("2026-09-17T06:01:00Z"), h.bookingId)).rejects.toMatchObject({ code: "bad_status" });
  });
  it("неоплаченное удержание отметить нельзя", async () => {
    const s = await seedClinic(sql);
    const h = await holdSlot(sql, at("2026-09-14T06:00:00Z"), { serviceId: s.consultId, doctorId: s.doctorId, startsAt: localTime("2026-09-17", 600), patient, consentIds: s.consentIds });
    await expect(markDone(sql, at("2026-09-17T06:00:00Z"), h.bookingId)).rejects.toMatchObject({ code: "bad_status" });
  });
});
