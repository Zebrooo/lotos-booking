import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { testDb, truncateAll, seedClinic } from "./helpers";
import type { Sql } from "@/lib/db/client";
import { holdSlot } from "@/lib/usecases/hold";
import { createPayment, applyPaymentNotification, ledgerRows } from "@/lib/usecases/payment";
import { cancelBooking, executeRefund } from "@/lib/usecases/cancel";
import { transferBooking } from "@/lib/usecases/transfer";
import { retryRefunds } from "@/lib/jobs/sweeps";
import { createFakePaymentProvider } from "@/adapters/payment-fake";
import { localTime } from "@/domain/time";

let sql: Sql;
beforeAll(() => { sql = testDb(); });
afterAll(async () => { await sql.end(); });
beforeEach(async () => { await truncateAll(sql); });

const payment = createFakePaymentProvider({ baseUrl: "http://localhost:3000", secret: "s" });
const patient = { fullName: "Иванов Иван Иванович", birthDate: "1980-01-01", phone: "+79000000001", email: "ivanov@example.com" };
const START = localTime("2026-09-17", 600); // чт 10:00 местного = 05:00Z
const at = (iso: string) => ({ now: () => new Date(iso) });

async function paidBooking(clock = at("2026-09-14T06:00:00Z")) {
  const s = await seedClinic(sql);
  const h = await holdSlot(sql, clock, { serviceId: s.consultId, doctorId: s.doctorId, startsAt: START, patient, consentIds: s.consentIds });
  const { paymentId } = await createPayment(sql, { payment, clock }, { token: h.token, returnUrl: "http://x/r" });
  await applyPaymentNotification(sql, clock, { provider: "fake", notification: { externalId: `fake-${paymentId}`, status: "paid", amountKopecks: 40000, raw: {} } });
  return h;
}

describe("cancelBooking", () => {
  it("до порога: запись отменена, ресурсы свободны, возврат в работе; executeRefund пишет ledger и чек", async () => {
    const h = await paidBooking();
    const r = await cancelBooking(sql, at("2026-09-15T05:00:00Z"), { token: h.token, actor: "patient" });
    expect(r.outcome).toEqual({ kind: "refund", reason: "before_threshold" });
    const [b] = await sql<{ status: string; cancelledBy: string; hoursBeforeCancel: string }[]>`select status, cancelled_by, hours_before_cancel from bookings where id = ${h.bookingId}`;
    expect(b).toMatchObject({ status: "cancelled", cancelledBy: "patient", hoursBeforeCancel: "48.00" });
    const active = await sql`select 1 from booking_resources where booking_id = ${h.bookingId} and active`;
    expect(active).toHaveLength(0);
    const [rf] = await sql<{ status: string; amountKopecks: number }[]>`select status, amount_kopecks from refunds where id = ${r.refundId}`;
    expect(rf).toEqual({ status: "pending", amountKopecks: 40000 });
    expect(await ledgerRows(sql, h.bookingId)).toEqual([{ kind: "advance", amountKopecks: 40000 }]);

    expect(await executeRefund(sql, payment, r.refundId!)).toEqual({ ok: true });
    expect(await ledgerRows(sql, h.bookingId)).toEqual([{ kind: "advance", amountKopecks: 40000 }, { kind: "refund", amountKopecks: 40000 }]);
    const receipts = await sql<{ kind: string }[]>`select kind from receipts where booking_id = ${h.bookingId} order by id`;
    expect(receipts.map(x => x.kind)).toEqual(["advance", "refund"]);
    const [rf2] = await sql<{ status: string; externalId: string }[]>`select status, external_id from refunds where id = ${r.refundId}`;
    expect(rf2).toMatchObject({ status: "done", externalId: `refund-fake-${1}` });
    expect(await executeRefund(sql, payment, r.refundId!)).toEqual({ ok: true }); // повтор ничего не дублирует
    expect(await ledgerRows(sql, h.bookingId)).toHaveLength(2);
  });

  it("после порога: удержание в журнале, возврата нет, письмо в очереди", async () => {
    const h = await paidBooking();
    const r = await cancelBooking(sql, at("2026-09-16T20:00:00Z"), { token: h.token, actor: "patient" });
    expect(r.outcome).toEqual({ kind: "retain", reason: "after_threshold" });
    expect(r.refundId).toBeNull();
    expect(await ledgerRows(sql, h.bookingId)).toEqual([{ kind: "advance", amountKopecks: 40000 }, { kind: "retain", amountKopecks: 40000 }]);
    const mails = await sql<{ template: string }[]>`select template from notifications where booking_id = ${h.bookingId} order by id`;
    expect(mails.map(m => m.template)).toEqual(["booking_confirmed", "booking_cancelled_retained"]);
  });

  it("клиника отменяет впритык — всё равно возврат", async () => {
    const h = await paidBooking();
    const r = await cancelBooking(sql, at("2026-09-17T04:00:00Z"), { bookingId: h.bookingId, actor: "clinic", reason: "врач заболел" });
    expect(r.outcome).toEqual({ kind: "refund", reason: "by_clinic" });
    const [b] = await sql<{ cancelReason: string; cancelledBy: string }[]>`select cancel_reason, cancelled_by from bookings where id = ${h.bookingId}`;
    expect(b).toEqual({ cancelReason: "врач заболел", cancelledBy: "clinic" });
  });

  it("неоплаченное удержание отменяется без денег; второй раз — bad_status", async () => {
    const s = await seedClinic(sql);
    const h = await holdSlot(sql, at("2026-09-14T06:00:00Z"), { serviceId: s.consultId, doctorId: s.doctorId, startsAt: START, patient, consentIds: s.consentIds });
    const r = await cancelBooking(sql, at("2026-09-14T06:05:00Z"), { token: h.token, actor: "patient" });
    expect(r.outcome).toEqual({ kind: "none", reason: "not_paid" });
    await expect(cancelBooking(sql, at("2026-09-14T06:06:00Z"), { token: h.token, actor: "patient" })).rejects.toMatchObject({ code: "bad_status" });
  });
  it("после переноса возврат идёт по исходному платежу", async () => {
    const h = await paidBooking();
    const [d] = await sql<{ id: number }[]>`select resource_id as id from bookings where id = ${h.bookingId}`;
    const moved = await transferBooking(sql, at("2026-09-14T07:00:00Z"), { token: h.token, doctorId: d!.id, startsAt: localTime("2026-09-18", 600), actor: "patient" });
    const r = await cancelBooking(sql, at("2026-09-15T05:00:00Z"), { token: moved.newToken, actor: "patient" });
    expect(r.refundId).not.toBeNull();
    expect(await executeRefund(sql, payment, r.refundId!)).toEqual({ ok: true });
    expect(await ledgerRows(sql, moved.newBookingId)).toEqual([{ kind: "transfer_in", amountKopecks: 40000 }, { kind: "refund", amountKopecks: 40000 }]);
  });

  it("аванс наличными: возврат выдаёт регистратура — фон его не трогает, СМС говорит про кассу", async () => {
    const s = await seedClinic(sql);
    const h = await holdSlot(sql, at("2026-09-14T06:00:00Z"), { serviceId: s.consultId, doctorId: s.doctorId, startsAt: START, patient, consentIds: s.consentIds, source: "admin" });
    await sql`update bookings set status = 'confirmed', paid_at = now() where id = ${h.bookingId}`;
    await sql`insert into ledger (booking_id, kind, amount_kopecks, channel, detail) values (${h.bookingId}, 'advance', 40000, 'cash', 'Наличные · касса · чек аванса')`;
    const r = await cancelBooking(sql, at("2026-09-15T05:00:00Z"), { token: h.token, actor: "clinic", reason: "По инициативе клиники" });
    expect(r.outcome.kind).toBe("refund");
    const [rf] = await sql<{ method: string; paymentId: number | null; status: string }[]>`select method, payment_id, status from refunds where id = ${r.refundId}`;
    expect(rf).toEqual({ method: "cash", paymentId: null, status: "pending" });
    expect(await retryRefunds(sql, payment)).toBe(0);
    const [n] = await sql<{ payload: { method: string } }[]>`select payload from notifications where template = 'booking_cancelled_refund'`;
    expect(n!.payload.method).toBe("cash");
  });
});
