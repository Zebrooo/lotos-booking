import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { testDb, truncateAll, seedClinic } from "./helpers";
import type { Sql } from "@/lib/db/client";
import { holdSlot } from "@/lib/usecases/hold";
import { createPayment, applyPaymentNotification, ledgerRows } from "@/lib/usecases/payment";
import { createFakePaymentProvider } from "@/adapters/payment-fake";
import { localTime } from "@/domain/time";

let sql: Sql;
beforeAll(() => { sql = testDb(); });
afterAll(async () => { await sql.end(); });
beforeEach(async () => { await truncateAll(sql); });

const clock = { now: () => new Date("2026-09-14T06:00:00Z") };
const payment = createFakePaymentProvider({ baseUrl: "http://localhost:3000", secret: "s" });
const patient = { fullName: "Иванов Иван Иванович", birthDate: "1980-01-01", phone: "+79000000001", email: "ivanov@example.com" };

async function heldBooking() {
  const s = await seedClinic(sql);
  return holdSlot(sql, clock, { serviceId: s.consultId, doctorId: s.doctorId, startsAt: localTime("2026-09-15", 600), patient, consentIds: s.consentIds });
}

describe("createPayment", () => {
  it("создаёт платёж на сумму предоплаты и отдаёт ссылку; повтор возвращает ту же", async () => {
    const h = await heldBooking();
    const r1 = await createPayment(sql, { payment, clock }, { token: h.token, returnUrl: "http://x/r" });
    expect(r1.payUrl).toContain("fake-");
    const r2 = await createPayment(sql, { payment, clock }, { token: h.token, returnUrl: "http://x/r" });
    expect(r2.paymentId).toBe(r1.paymentId);
    const [p] = await sql<{ amountKopecks: number; status: string; externalId: string }[]>`select amount_kopecks, status, external_id from payments`;
    expect(p).toMatchObject({ amountKopecks: 40000, status: "created", externalId: `fake-${r1.paymentId}` });
  });
  it("после истечения удержания платёж не создаётся", async () => {
    const h = await heldBooking();
    const late = { now: () => new Date("2026-09-14T06:20:00Z") };
    await expect(createPayment(sql, { payment, clock: late }, { token: h.token, returnUrl: "http://x/r" })).rejects.toMatchObject({ code: "bad_status" });
  });
});

describe("applyPaymentNotification", () => {
  it("подтверждает запись, пишет аванс, чек и письмо; повтор ничего не меняет", async () => {
    const h = await heldBooking();
    const { paymentId } = await createPayment(sql, { payment, clock }, { token: h.token, returnUrl: "http://x/r" });
    const n = { externalId: `fake-${paymentId}`, status: "paid" as const, amountKopecks: 40000, raw: {} };
    expect(await applyPaymentNotification(sql, clock, { provider: "fake", notification: n })).toEqual({ outcome: "confirmed" });
    expect(await applyPaymentNotification(sql, clock, { provider: "fake", notification: n })).toEqual({ outcome: "already" });
    const [b] = await sql<{ status: string; paidAt: Date | null; holdUntil: Date | null }[]>`select status, paid_at, hold_until from bookings where id = ${h.bookingId}`;
    expect(b!.status).toBe("confirmed");
    expect(b!.paidAt?.toISOString()).toBe("2026-09-14T06:00:00.000Z");
    expect(await ledgerRows(sql, h.bookingId)).toEqual([{ kind: "advance", amountKopecks: 40000 }]);
    const receipts = await sql`select kind, status, email from receipts where booking_id = ${h.bookingId}`;
    expect(receipts).toEqual([{ kind: "advance", status: "pending", email: "ivanov@example.com" }]);
    const mails = await sql`select template, status from notifications where booking_id = ${h.bookingId}`;
    expect(mails).toEqual([{ template: "booking_confirmed", status: "queued" }]);
  });
  it("сумма не сошлась — не зачисляем; неизвестный платёж — unknown; failed — платёж failed", async () => {
    const h = await heldBooking();
    const { paymentId } = await createPayment(sql, { payment, clock }, { token: h.token, returnUrl: "http://x/r" });
    expect(await applyPaymentNotification(sql, clock, { provider: "fake", notification: { externalId: `fake-${paymentId}`, status: "paid", amountKopecks: 39900, raw: {} } })).toEqual({ outcome: "amount_mismatch" });
    expect(await applyPaymentNotification(sql, clock, { provider: "fake", notification: { externalId: "fake-999", status: "paid", amountKopecks: 40000, raw: {} } })).toEqual({ outcome: "unknown" });
    expect(await applyPaymentNotification(sql, clock, { provider: "fake", notification: { externalId: `fake-${paymentId}`, status: "failed", amountKopecks: 40000, raw: {} } })).toEqual({ outcome: "failed" });
    const [b] = await sql<{ status: string }[]>`select status from bookings where id = ${h.bookingId}`;
    expect(b!.status).toBe("held");
  });
  it("оплата после истечения: платёж paid, аванс записан, запись не восстанавливается", async () => {
    const h = await heldBooking();
    const { paymentId } = await createPayment(sql, { payment, clock }, { token: h.token, returnUrl: "http://x/r" });
    await sql`update bookings set status = 'expired', hold_until = null where id = ${h.bookingId}`;
    await sql`update booking_resources set active = false where booking_id = ${h.bookingId}`;
    const r = await applyPaymentNotification(sql, clock, { provider: "fake", notification: { externalId: `fake-${paymentId}`, status: "paid", amountKopecks: 40000, raw: {} } });
    expect(r).toEqual({ outcome: "paid_after_expiry" });
    expect(await ledgerRows(sql, h.bookingId)).toEqual([{ kind: "advance", amountKopecks: 40000 }]);
    const [b] = await sql<{ status: string }[]>`select status from bookings where id = ${h.bookingId}`;
    expect(b!.status).toBe("expired");
  });

  it("бронь: платёж по ссылке до срока, после — нельзя; оплата подтверждает, чек — на телефон", async () => {
    const h = await heldBooking();
    await sql`update bookings set status = 'pending', pay_mode = 'reserve', pay_deadline = '2026-09-14T12:00:00Z', hold_until = null,
      booker_phone = '+79001234567' where id = ${h.bookingId}`;
    const late = { now: () => new Date("2026-09-14T12:01:00Z") };
    await expect(createPayment(sql, { payment, clock: late }, { token: h.token, returnUrl: "http://x/r" })).rejects.toMatchObject({ code: "bad_status" });
    const { paymentId } = await createPayment(sql, { payment, clock: { now: () => new Date("2026-09-14T11:00:00Z") } }, { token: h.token, returnUrl: "http://x/r" });
    const r = await applyPaymentNotification(sql, clock, { provider: "fake", notification: { externalId: `fake-${paymentId}`, status: "paid", amountKopecks: 40000, raw: {} } });
    expect(r).toEqual({ outcome: "confirmed" });
    const [rc] = await sql<{ phone: string | null; email: string | null }[]>`select phone, email from receipts`;
    expect(rc).toEqual({ phone: "+79001234567", email: "ivanov@example.com" });
    const [l] = await sql<{ channel: string; detail: string }[]>`select channel, detail from ledger`;
    expect(l).toEqual({ channel: "online", detail: `Онлайн · fake-${paymentId} · чек аванса` });
  });
});
