// v2: уведомления — СМС на номер записавшего, чеки — на телефон, бронь
// без оплаты снимается по сроку, напоминание — накануне около 12:00.
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { testDb, truncateAll, seedClinic } from "./helpers";
import type { Sql } from "@/lib/db/client";
import type { SmsSender } from "@/ports/sms";
import { startBooking, confirmBookingCode } from "@/lib/usecases/start-booking";
import { createPayment, applyPaymentNotification } from "@/lib/usecases/payment";
import { cancelBooking, executeRefund } from "@/lib/usecases/cancel";
import { markDone } from "@/lib/usecases/outcome";
import { expireHolds } from "@/lib/usecases/expire";
import { queueReminders, sendQueuedNotifications } from "@/lib/jobs/sweeps";
import { createFakePaymentProvider } from "@/adapters/payment-fake";
import { localTime } from "@/domain/time";

let sql: Sql;
beforeAll(() => { sql = testDb(); });
afterAll(async () => { await sql.end(); });
beforeEach(async () => { await truncateAll(sql); });

const T0 = new Date("2026-09-14T06:00:00Z"); // пн 11:00 по Челябинску
const at = (iso: string | Date) => ({ now: () => new Date(iso) });
const START = localTime("2026-09-17", 600); // чт 10:00
const fake = createFakePaymentProvider({ baseUrl: "http://localhost:3000", secret: "s" });
const PHONE = "+79001234567";
function capture(): SmsSender & { sent: { phone: string; text: string }[] } {
  const sent: { phone: string; text: string }[] = [];
  return { name: "capture", sent, send: async (phone, text) => { sent.push({ phone, text }); return { ok: true, messageId: "1" }; } };
}
const self = { fio: "Смирнова Елена Андреевна", dob: "14.03.1988", phone: "+7 900 123-45-67", repFio: "", phone2: "" };
const mail = { siteUrl: "https://zapis.example.ru", clinic: { name: "Лотос", address: "Еманжелинск, ул. Гагарина, 12А", phone: "+7 900 023-05-50" } };

async function verified(payChoice: "online" | "reserve", clock = at(T0)) {
  const s = await seedClinic(sql);
  const deps = { sms: capture(), clock, pepper: "t", genCode: () => "2604", siteUrl: mail.siteUrl };
  const r = await startBooking(sql, deps, { serviceId: s.consultId, doctorId: s.doctorId, startsAt: START, who: "self", form: self, consentPd: true, consentPrepay: true, payChoice });
  if (!r.ok) throw new Error("не записались");
  await confirmBookingCode(sql, deps, { token: r.token, code: "2604" });
  const [b] = await sql<{ id: number }[]>`select id from bookings where token = ${r.token}`;
  return { token: r.token, id: b!.id, clock };
}
async function paid() {
  const v = await verified("online");
  const { paymentId } = await createPayment(sql, { payment: fake, clock: v.clock }, { token: v.token, returnUrl: "http://x/r" });
  await applyPaymentNotification(sql, v.clock, { provider: "fake", notification: { externalId: `fake-${paymentId}`, status: "paid", amountKopecks: 40000, raw: {} } });
  return v;
}
const smsRows = (id: number) => sql<{ channel: string; recipient: string; template: string }[]>`select channel, recipient, template from notifications where booking_id = ${id} order by id`;

describe("СМС и чеки по телефону", () => {
  it("оплата: СМС о подтверждении и чек аванса на телефон записавшего", async () => {
    const v = await paid();
    expect(await smsRows(v.id)).toEqual([{ channel: "sms", recipient: PHONE, template: "booking_confirmed" }]);
    expect(await sql`select kind, phone, email from receipts where booking_id = ${v.id}`).toEqual([{ kind: "advance", phone: PHONE, email: null }]);
  });

  it("копия чека на почту — только если включена в кабинете", async () => {
    await sql`insert into patient_accounts (phone, email, notify_email) values (${PHONE}, 'elena@example.com', true)`;
    const v = await paid();
    expect(await sql`select phone, email from receipts where booking_id = ${v.id}`).toEqual([{ phone: PHONE, email: "elena@example.com" }]);
  });

  it("отмена оплаченной: СМС о возврате, чек возврата на телефон; приём — чек зачёта на телефон", async () => {
    const v = await paid();
    const r = await cancelBooking(sql, at("2026-09-15T05:00:00Z"), { token: v.token, actor: "patient" });
    await executeRefund(sql, fake, r.refundId!);
    expect((await smsRows(v.id)).map(x => x.template)).toEqual(["booking_confirmed", "booking_cancelled_refund"]);
    expect(await sql`select kind, phone from receipts where booking_id = ${v.id} order by id`).toEqual([{ kind: "advance", phone: PHONE }, { kind: "refund", phone: PHONE }]);

    await truncateAll(sql);
    const w = await paid();
    await markDone(sql, at("2026-09-17T05:30:00Z"), w.id);
    expect(await sql`select kind, phone from receipts where booking_id = ${w.id} order by id`).toEqual([{ kind: "advance", phone: PHONE }, { kind: "settle", phone: PHONE }]);
  });

  it("фоновый проход отправляет СМС через СМС-шлюз с текстом по шаблону", async () => {
    const v = await paid();
    const sms = capture();
    expect(await sendQueuedNotifications(sql, { notifier: { name: "x", sendEmail: async () => ({ ok: false, error: "не должно" }) }, sms }, mail, at(T0))).toBe(1);
    expect(sms.sent).toEqual([{ phone: PHONE, text: `Лотос: запись подтверждена — чт, 17 сентября в 10:00, Жаворонкова А. А. Предоплата 400 ₽ получена. https://zapis.example.ru/moya-zapis/${v.token}` }]);
    const [n] = await sql<{ status: string }[]>`select status from notifications`;
    expect(n!.status).toBe("sent");
  });
});

describe("бронь без оплаты", () => {
  it("снимается после срока оплаты: окно свободно, пациенту СМС", async () => {
    const v = await verified("reserve");
    const [b] = await sql<{ status: string; payDeadline: Date }[]>`select status, pay_deadline from bookings where id = ${v.id}`;
    expect(b!.status).toBe("pending");
    expect(await expireHolds(sql, at(new Date(b!.payDeadline.getTime() - 1000)))).toBe(0);
    expect(await expireHolds(sql, at(new Date(b!.payDeadline.getTime() + 1000)))).toBe(1);
    const [after] = await sql<{ status: string }[]>`select status from bookings where id = ${v.id}`;
    expect(after!.status).toBe("expired");
    expect(await sql`select 1 from booking_resources where booking_id = ${v.id} and active`).toHaveLength(0);
    expect((await smsRows(v.id)).map(x => x.template)).toContain("booking_expired");
  });

  it("«оплата заявлена» не снимается — ждёт сверки", async () => {
    const v = await verified("reserve");
    await sql`update bookings set status = 'claimed', claim_note = 'перевёл' where id = ${v.id}`;
    expect(await expireHolds(sql, at("2026-09-20T00:00:00Z"))).toBe(0);
  });
});

describe("напоминание накануне", () => {
  it("около 12:00 накануне, один раз", async () => {
    await paid(); // создана в пн 11:00, приём чт 10:00 → напоминание ср 12:00 (07:00Z)
    expect(await queueReminders(sql, at("2026-09-16T06:59:00Z"))).toBe(0);
    expect(await queueReminders(sql, at("2026-09-16T07:00:00Z"))).toBe(1);
    expect(await queueReminders(sql, at("2026-09-16T08:00:00Z"))).toBe(0);
    const rows = await sql<{ template: string; channel: string }[]>`select template, channel from notifications order by id`;
    expect(rows.at(-1)).toEqual({ template: "booking_reminder", channel: "sms" });
  });

  it("неоплаченной брони тоже напоминаем (со сроком оплаты), отключённым — нет", async () => {
    await verified("reserve");
    expect(await queueReminders(sql, at("2026-09-16T07:00:00Z"))).toBe(1);
    await truncateAll(sql);
    await sql`insert into patient_accounts (phone, notify_remind) values (${PHONE}, false)`;
    await paid();
    expect(await queueReminders(sql, at("2026-09-16T07:00:00Z"))).toBe(0);
  });

  it("записи по телефону и на стойке напоминание не получают (как в макете CRM)", async () => {
    const v = await paid();
    await sql`update bookings set source = 'admin' where id = ${v.id}`;
    expect(await queueReminders(sql, at("2026-09-16T07:00:00Z"))).toBe(0);
  });

  it("запись, сделанная вечером накануне, напоминания не получает", async () => {
    const v = await verified("online", at("2026-09-16T14:00:00Z")); // ср 19:00
    const { paymentId } = await createPayment(sql, { payment: fake, clock: v.clock }, { token: v.token, returnUrl: "http://x/r" });
    await applyPaymentNotification(sql, v.clock, { provider: "fake", notification: { externalId: `fake-${paymentId}`, status: "paid", amountKopecks: 40000, raw: {} } });
    expect(await queueReminders(sql, at("2026-09-16T15:00:00Z"))).toBe(0);
    expect(await queueReminders(sql, at("2026-09-17T03:00:00Z"))).toBe(0);
  });
});
