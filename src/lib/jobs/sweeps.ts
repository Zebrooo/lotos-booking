// Фоновые проходы по таблицам-очередям: чеки, письма, возвраты, напоминания,
// опрос платежей. Каждый проход берёт пачку строк, пишет попытку и итог в
// саму строку. Строка и есть состояние задачи; отдельной очереди нет.
import type { Sql } from "@/lib/db/client";
import type { Clock } from "@/ports/clock";
import type { Fiscalizer } from "@/ports/fiscal";
import type { Notifier } from "@/ports/notify";
import type { SmsSender } from "@/ports/sms";
import type { PaymentProvider } from "@/ports/payment";
import { addMinutes, localDay } from "@/domain/time";
import { reminderAt } from "@/domain/reminder";
import { renderEmail, isEmailTemplate, type EmailContext } from "@/lib/email/render";
import { renderSms, isSmsTemplate } from "@/lib/sms/render";
import { shortName } from "@/lib/format";
import { queueSms } from "@/lib/usecases/contact";
import { loadSettings } from "@/lib/usecases/settings";
import { executeRefund } from "@/lib/usecases/cancel";
import { applyPaymentNotification } from "@/lib/usecases/payment";

export const MAX_ATTEMPTS = 5;
/** Платёж без уведомления дольше этого — спрашиваем провайдера сами. */
export const POLL_AFTER_MINUTES = 2;

const nextStatus = (attempts: number, retry: string) => (attempts >= MAX_ATTEMPTS ? "failed" : retry);

export async function sendPendingReceipts(sql: Sql, fiscal: Fiscalizer, limit = 20): Promise<number> {
  const rows = await sql<{ id: number; bookingId: number; kind: "advance" | "settle" | "refund"; amountKopecks: number; phone: string | null; email: string | null; attempts: number; service: { title: string } }[]>`
    select r.id, r.booking_id, r.kind, r.amount_kopecks, r.phone, nullif(r.email, '') as email, r.attempts, b.service
    from receipts r join bookings b on b.id = r.booking_id
    where r.status = 'pending' order by r.id limit ${limit}`;
  for (const r of rows) {
    const res = await fiscal.send({ kind: r.kind, amountKopecks: r.amountKopecks, phone: r.phone, email: r.email, description: r.service.title, bookingId: r.bookingId });
    const attempts = r.attempts + 1;
    if (res.ok) {
      await sql`update receipts set status = 'sent', provider = ${fiscal.name}, external_id = ${res.externalId}, attempts = ${attempts}, last_error = null where id = ${r.id}`;
    } else {
      await sql`update receipts set status = ${nextStatus(attempts, "pending")}, attempts = ${attempts}, last_error = ${res.error} where id = ${r.id}`;
    }
  }
  return rows.length;
}

export type MailSettings = { siteUrl: string; clinic: EmailContext["clinic"] };

export type Outbox = { notifier: Notifier; sms: SmsSender };

/** Очередь уведомлений: СМС (v2) и письма (записи первой версии). */
export async function sendQueuedNotifications(sql: Sql, out: Outbox, mail: MailSettings, clock: Clock, limit = 20): Promise<number> {
  const settings = await loadSettings(sql);
  const rows = await sql<{
    id: number; channel: "sms" | "email"; recipient: string; template: string; payload: { reason?: string; method?: string }; attempts: number;
    token: string | null; status: string | null; service: { title: string; prepayKopecks: number } | null; startsAt: Date | null;
    holdUntil: Date | null; payDeadline: Date | null; doctorTitle: string | null; doctorKind: string | null; prepNote: string | null;
  }[]>`
    select n.id, n.channel, n.recipient, n.template, n.payload, n.attempts, b.token, b.status, b.service, b.starts_at, b.hold_until, b.pay_deadline,
      r.title as doctor_title, r.kind as doctor_kind, s.prep_note
    from notifications n
    left join bookings b on b.id = n.booking_id
    left join resources r on r.id = b.resource_id
    left join services s on s.id = b.service_id
    where n.status = 'queued' order by n.id limit ${limit}`;
  for (const n of rows) {
    const attempts = n.attempts + 1;
    const known = n.channel === "sms" ? isSmsTemplate(n.template) : isEmailTemplate(n.template);
    if (!known || !n.token || !n.service || !n.startsAt) {
      await sql`update notifications set status = 'failed', attempts = ${attempts}, last_error = 'нет записи или неизвестный шаблон' where id = ${n.id}`;
      continue;
    }
    const reason = n.payload.reason;
    const refundReason = reason === "cooling_off" || reason === "before_threshold" || reason === "by_clinic" ? reason : null;
    let res: { ok: true } | { ok: false; error: string };
    if (n.channel === "sms" && isSmsTemplate(n.template)) {
      const text = renderSms(n.template, {
        siteUrl: mail.siteUrl, token: n.token, now: clock.now(), clinic: { address: mail.clinic.address, phone: mail.clinic.phone },
        serviceTitle: n.service.title, doctorShort: n.doctorKind === "doctor" ? shortName(n.doctorTitle ?? "") : n.doctorTitle ?? "",
        startsAt: n.startsAt, prepayKopecks: n.service.prepayKopecks, arriveEarlyMinutes: settings.arriveEarlyMinutes,
        status: n.status ?? "", payDeadline: n.status === "held" ? n.holdUntil : n.payDeadline, refundReason,
        refundMethod: n.payload.method === "cash" || n.payload.method === "bank" ? n.payload.method : "provider",
      });
      res = await out.sms.send(n.recipient, text);
    } else if (isEmailTemplate(n.template)) {
      const msg = renderEmail(n.template, {
        siteUrl: mail.siteUrl, clinic: mail.clinic, token: n.token,
        serviceTitle: n.service.title, doctorTitle: n.doctorTitle ?? "", startsAt: n.startsAt,
        prepayKopecks: n.service.prepayKopecks, arriveEarlyMinutes: settings.arriveEarlyMinutes, prepNote: n.prepNote, refundReason,
      });
      res = await out.notifier.sendEmail({ to: n.recipient, subject: msg.subject, text: msg.text });
    } else {
      res = { ok: false, error: "шаблон не для этого канала" };
    }
    if (res.ok) {
      await sql`update notifications set status = 'sent', sent_at = now(), attempts = ${attempts}, last_error = null where id = ${n.id}`;
    } else {
      await sql`update notifications set status = ${nextStatus(attempts, "queued")}, attempts = ${attempts}, last_error = ${res.error} where id = ${n.id}`;
    }
  }
  return rows.length;
}

export async function retryRefunds(sql: Sql, payment: PaymentProvider, limit = 10): Promise<number> {
  // Только возвраты через провайдера: наличные и переводы выдаёт регистратура.
  const rows = await sql<{ id: number }[]>`select id from refunds
    where status in ('pending', 'failed') and method = 'provider' and attempts < ${MAX_ATTEMPTS} order by id limit ${limit}`;
  for (const r of rows) await executeRefund(sql, payment, r.id);
  return rows.length;
}

/**
 * Напоминание по СМС (дизайн v2): накануне около 12:00, а если запись сделана
 * накануне после полудня — в 18:00 (domain/reminder). Время считается от
 * момента записи, поэтому записавшимся вечером накануне СМС не шлём: им только
 * что пришло СМС о записи. Один раз на запись; в день приёма — уже нет.
 * Неоплаченной брони тоже напоминаем — со сроком оплаты. Только записям с
 * сайта: записанным по телефону и на стойке СМС не шлём (дизайн v2, CRM).
 */
export async function queueReminders(sql: Sql, clock: Clock): Promise<number> {
  const now = clock.now();
  const today = localDay(now);
  const rows = await sql<{ id: number; startsAt: Date; createdAt: Date }[]>`
    select b.id, b.starts_at, b.created_at
    from bookings b join patients p on p.id = b.patient_id
    left join patient_accounts a on a.phone = coalesce(b.booker_phone, p.phone)
    where b.status in ('confirmed', 'claimed', 'pending') and b.source = 'site'
      and b.starts_at > ${now} and b.starts_at <= ${addMinutes(now, 48 * 60)}
      and coalesce(a.notify_remind, true)
      and not exists (select 1 from notifications n where n.booking_id = b.id and n.template = 'booking_reminder')
    order by b.starts_at`;
  let queued = 0;
  for (const b of rows) {
    const t = reminderAt({ now: b.createdAt, startsAt: b.startsAt });
    if (!t || t > now || localDay(b.startsAt) <= today) continue;
    await queueSms(sql, b.id, "booking_reminder");
    queued++;
  }
  return queued;
}

/** Платежи без уведомления: спрашиваем провайдера и проводим ответ как уведомление. */
export async function pollPendingPayments(sql: Sql, payment: PaymentProvider, clock: Clock, limit = 20): Promise<number> {
  const now = clock.now();
  const rows = await sql<{ externalId: string; amountKopecks: number }[]>`
    select p.external_id, p.amount_kopecks from payments p join bookings b on b.id = p.booking_id
    where p.status = 'created' and p.provider = ${payment.name} and p.external_id is not null
      and p.created_at < ${addMinutes(now, -POLL_AFTER_MINUTES)} and b.status = 'held'
    order by p.id limit ${limit}`;
  for (const p of rows) {
    const status = await payment.status(p.externalId);
    if (status === "pending") continue;
    await applyPaymentNotification(sql, clock, {
      provider: payment.name,
      notification: { externalId: p.externalId, status, amountKopecks: p.amountKopecks, raw: { source: "poll" } },
    });
  }
  return rows.length;
}
