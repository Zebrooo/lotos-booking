import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { testDb, truncateAll, seedClinic } from "./helpers";
import type { Sql } from "@/lib/db/client";
import { holdSlot } from "@/lib/usecases/hold";
import { createPayment, applyPaymentNotification, ledgerRows } from "@/lib/usecases/payment";
import { transferBooking } from "@/lib/usecases/transfer";
import { createFakePaymentProvider } from "@/adapters/payment-fake";
import { localTime } from "@/domain/time";

let sql: Sql;
beforeAll(() => { sql = testDb(); });
afterAll(async () => { await sql.end(); });
beforeEach(async () => { await truncateAll(sql); });

const payment = createFakePaymentProvider({ baseUrl: "http://localhost:3000", secret: "s" });
const patient = { fullName: "Иванов Иван Иванович", birthDate: "1980-01-01", phone: "+79000000001", email: "ivanov@example.com" };
const at = (iso: string) => ({ now: () => new Date(iso) });
const START = localTime("2026-09-17", 600);

async function paid() {
  const s = await seedClinic(sql);
  const clock = at("2026-09-14T06:00:00Z");
  const h = await holdSlot(sql, clock, { serviceId: s.consultId, doctorId: s.doctorId, startsAt: START, patient, consentIds: s.consentIds });
  const { paymentId } = await createPayment(sql, { payment, clock }, { token: h.token, returnUrl: "http://x/r" });
  await applyPaymentNotification(sql, clock, { provider: "fake", notification: { externalId: `fake-${paymentId}`, status: "paid", amountKopecks: 40000, raw: {} } });
  return { s, h };
}

describe("transferBooking", () => {
  it("до порога: старая закрыта, новая подтверждена, деньги переехали, согласия скопированы", async () => {
    const { s, h } = await paid();
    const r = await transferBooking(sql, at("2026-09-15T05:00:00Z"), { token: h.token, actor: "patient", doctorId: s.doctorId, startsAt: localTime("2026-09-18", 900) });
    expect(r.newBookingId).not.toBe(h.bookingId);
    const [oldB] = await sql<{ status: string }[]>`select status from bookings where id = ${h.bookingId}`;
    const [newB] = await sql<{ status: string; paidAt: Date | null; transferredFromId: number }[]>`select status, paid_at, transferred_from_id from bookings where id = ${r.newBookingId}`;
    expect(oldB!.status).toBe("transferred");
    expect(newB).toMatchObject({ status: "confirmed", transferredFromId: h.bookingId });
    expect(newB!.paidAt).not.toBeNull();
    expect(await ledgerRows(sql, h.bookingId)).toEqual([{ kind: "advance", amountKopecks: 40000 }, { kind: "transfer_out", amountKopecks: 40000 }]);
    expect(await ledgerRows(sql, r.newBookingId)).toEqual([{ kind: "transfer_in", amountKopecks: 40000 }]);
    const oldActive = await sql`select 1 from booking_resources where booking_id = ${h.bookingId} and active`;
    expect(oldActive).toHaveLength(0);
    const cons = await sql`select 1 from booking_consents where booking_id = ${r.newBookingId}`;
    expect(cons).toHaveLength(2);
    const pays = await sql`select 1 from payments`;
    expect(pays).toHaveLength(1); // нового платежа нет
  });

  it("пациент после порога — transfer_not_allowed; клиника может", async () => {
    const { s, h } = await paid();
    await expect(transferBooking(sql, at("2026-09-16T20:00:00Z"), { token: h.token, actor: "patient", doctorId: s.doctorId, startsAt: localTime("2026-09-18", 900) })).rejects.toMatchObject({ code: "transfer_not_allowed" });
    await expect(transferBooking(sql, at("2026-09-16T20:00:00Z"), { token: h.token, actor: "clinic", doctorId: s.doctorId, startsAt: localTime("2026-09-18", 900) })).resolves.toBeTruthy();
  });

  it("на занятое окно — slot_taken, старая запись не тронута", async () => {
    const { s, h } = await paid();
    const other = { ...patient, phone: "+79000000002" };
    await holdSlot(sql, at("2026-09-14T06:00:00Z"), { serviceId: s.consultId, doctorId: s.doctorId, startsAt: localTime("2026-09-18", 900), patient: other, consentIds: s.consentIds });
    await expect(transferBooking(sql, at("2026-09-15T05:00:00Z"), { token: h.token, actor: "patient", doctorId: s.doctorId, startsAt: localTime("2026-09-18", 900) })).rejects.toMatchObject({ code: "slot_taken" });
    const [oldB] = await sql<{ status: string }[]>`select status from bookings where id = ${h.bookingId}`;
    expect(oldB!.status).toBe("confirmed");
  });

  it("неоплаченная бронь переезжает бронью с новым сроком оплаты; денег в журнале нет", async () => {
    const s = await seedClinic(sql);
    const clock = at("2026-09-14T06:00:00Z");
    const h = await holdSlot(sql, clock, { serviceId: s.consultId, doctorId: s.doctorId, startsAt: START, patient, consentIds: s.consentIds });
    await sql`update bookings set status = 'pending', pay_mode = 'reserve', pay_deadline = '2026-09-14T12:00:00Z', hold_until = null where id = ${h.bookingId}`;
    const r = await transferBooking(sql, at("2026-09-14T07:00:00Z"), { token: h.token, actor: "patient", doctorId: s.doctorId, startsAt: localTime("2026-09-18", 900) });
    const [nb] = await sql<{ status: string; payMode: string; payDeadline: Date; paidAt: Date | null }[]>`select status, pay_mode, pay_deadline, paid_at from bookings where id = ${r.newBookingId}`;
    expect(nb).toMatchObject({ status: "pending", payMode: "reserve", paidAt: null });
    expect(nb!.payDeadline.toISOString()).toBe("2026-09-14T12:00:00.000Z"); // пн 17:00 по Челябинску
    expect(await ledgerRows(sql, r.newBookingId)).toEqual([]);
  });
});
