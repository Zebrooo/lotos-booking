import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { testDb, truncateAll, seedClinic } from "./helpers";
import type { Sql } from "@/lib/db/client";
import type { Fiscalizer } from "@/ports/fiscal";
import type { Notifier } from "@/ports/notify";
import type { SmsSender } from "@/ports/sms";
import type { PaymentProvider } from "@/ports/payment";
import { holdSlot } from "@/lib/usecases/hold";
import { createPayment, applyPaymentNotification, ledgerRows } from "@/lib/usecases/payment";
import { cancelBooking } from "@/lib/usecases/cancel";
import { sendPendingReceipts, sendQueuedNotifications, retryRefunds, pollPendingPayments, MAX_ATTEMPTS } from "@/lib/jobs/sweeps";
import { createFakePaymentProvider } from "@/adapters/payment-fake";
import { logFiscalizer } from "@/adapters/fiscal-log";
import { localTime } from "@/domain/time";

let sql: Sql;
beforeAll(() => { sql = testDb(); });
afterAll(async () => { await sql.end(); });
beforeEach(async () => { await truncateAll(sql); });

const fake = createFakePaymentProvider({ baseUrl: "http://localhost:3000", secret: "s" });
const patient = { fullName: "Иванов Иван Иванович", birthDate: "1980-01-01", phone: "+79000000001", email: "ivanov@example.com" };
const at = (iso: string) => ({ now: () => new Date(iso) });
const START = localTime("2026-09-17", 600); // чт 10:00 местного = 05:00Z
const mailCtx = { siteUrl: "https://zapis.example.ru", clinic: { name: "Лотос", address: "Челябинск", phone: "+7 351 000-00-00" } };

async function held(clock = at("2026-09-14T06:00:00Z")) {
  const s = await seedClinic(sql);
  const h = await holdSlot(sql, clock, { serviceId: s.consultId, doctorId: s.doctorId, startsAt: START, patient, consentIds: s.consentIds });
  return { s, h, clock };
}
async function paid(clock = at("2026-09-14T06:00:00Z")) {
  const r = await held(clock);
  const { paymentId } = await createPayment(sql, { payment: fake, clock }, { token: r.h.token, returnUrl: "http://x/r" });
  await applyPaymentNotification(sql, clock, { provider: "fake", notification: { externalId: `fake-${paymentId}`, status: "paid", amountKopecks: 40000, raw: {} } });
  return r;
}
const failingFiscal: Fiscalizer = { name: "broken", send: async () => ({ ok: false, error: "касса недоступна" }) };
const noMail: Notifier = { name: "none", sendEmail: async () => ({ ok: false, error: "почта не используется" }) };
function capturingSms(fail = false): SmsSender & { sent: { phone: string; text: string }[] } {
  const sent: { phone: string; text: string }[] = [];
  return { name: "capture", sent, send: async (phone, text) => { if (fail) return { ok: false, error: "шлюз недоступен" }; sent.push({ phone, text }); return { ok: true, messageId: "m1" }; } };
}
const now14 = at("2026-09-14T06:00:00Z");

describe("чеки", () => {
  it("pending → sent с номером от кассы; повторный проход ничего не делает", async () => {
    await paid();
    expect(await sendPendingReceipts(sql, logFiscalizer)).toBe(1);
    const [r] = await sql<{ status: string; provider: string; externalId: string | null; attempts: number }[]>`select status, provider, external_id, attempts from receipts`;
    expect(r).toMatchObject({ status: "sent", provider: "log", attempts: 1 });
    expect(r!.externalId).toBeTruthy();
    expect(await sendPendingReceipts(sql, logFiscalizer)).toBe(0);
  });
  it("сбой кассы: попытки копятся, после предела — failed", async () => {
    await paid();
    for (let i = 1; i <= MAX_ATTEMPTS; i++) expect(await sendPendingReceipts(sql, failingFiscal)).toBe(1);
    const [r] = await sql<{ status: string; attempts: number; lastError: string }[]>`select status, attempts, last_error from receipts`;
    expect(r).toEqual({ status: "failed", attempts: MAX_ATTEMPTS, lastError: "касса недоступна" });
    expect(await sendPendingReceipts(sql, failingFiscal)).toBe(0);
  });
});

describe("уведомления", () => {
  it("подтверждение уходит СМС на телефон пациента со ссылкой на запись", async () => {
    const { h } = await paid();
    const sms = capturingSms();
    expect(await sendQueuedNotifications(sql, { notifier: noMail, sms }, mailCtx, now14)).toBe(1);
    expect(sms.sent).toHaveLength(1);
    expect(sms.sent[0]!.phone).toBe("+79000000001");
    expect(sms.sent[0]!.text).toContain("запись подтверждена");
    expect(sms.sent[0]!.text).toContain(`https://zapis.example.ru/moya-zapis/${h.token}`);
    const [row] = await sql<{ status: string; sentAt: Date | null }[]>`select status, sent_at from notifications`;
    expect(row!.status).toBe("sent");
    expect(row!.sentAt).not.toBeNull();
    expect(await sendQueuedNotifications(sql, { notifier: noMail, sms }, mailCtx, now14)).toBe(0);
  });
  it("сбой шлюза: остаётся в очереди, после предела — failed", async () => {
    await paid();
    const sms = capturingSms(true);
    await sendQueuedNotifications(sql, { notifier: noMail, sms }, mailCtx, now14);
    const [one] = await sql<{ status: string; attempts: number }[]>`select status, attempts from notifications`;
    expect(one).toEqual({ status: "queued", attempts: 1 });
    for (let i = 2; i <= MAX_ATTEMPTS; i++) await sendQueuedNotifications(sql, { notifier: noMail, sms }, mailCtx, now14);
    const [last] = await sql<{ status: string; lastError: string }[]>`select status, last_error from notifications`;
    expect(last).toEqual({ status: "failed", lastError: "шлюз недоступен" });
  });
});

describe("возвраты", () => {
  it("возврат в работе исполняется; сбой провайдера повторяется до предела", async () => {
    const { h } = await paid();
    await cancelBooking(sql, at("2026-09-15T05:00:00Z"), { token: h.token, actor: "patient" });
    const broken: PaymentProvider = { ...fake, refund: async () => ({ ok: false, error: "банк не ответил" }) };
    expect(await retryRefunds(sql, broken)).toBe(1);
    expect(await retryRefunds(sql, broken)).toBe(1);
    const [mid] = await sql<{ status: string; attempts: number }[]>`select status, attempts from refunds`;
    expect(mid).toEqual({ status: "failed", attempts: 2 });
    expect(await retryRefunds(sql, fake)).toBe(1);
    expect(await ledgerRows(sql, h.bookingId)).toEqual([{ kind: "advance", amountKopecks: 40000 }, { kind: "refund", amountKopecks: 40000 }]);
    expect(await retryRefunds(sql, fake)).toBe(0);
  });
});

describe("опрос платежей", () => {
  it("свежий платёж не трогаем, через две минуты спрашиваем провайдера и проводим оплату", async () => {
    const { h, clock } = await held();
    await createPayment(sql, { payment: fake, clock }, { token: h.token, returnUrl: "http://x/r" });
    const paysNow: PaymentProvider = { ...fake, status: async () => "paid" };
    expect(await pollPendingPayments(sql, paysNow, at("2026-09-14T06:01:00Z"))).toBe(0);
    expect(await pollPendingPayments(sql, paysNow, at("2026-09-14T06:03:00Z"))).toBe(1);
    const [b] = await sql<{ status: string }[]>`select status from bookings where id = ${h.bookingId}`;
    expect(b!.status).toBe("confirmed");
    expect(await pollPendingPayments(sql, paysNow, at("2026-09-14T06:04:00Z"))).toBe(0);
  });
});
