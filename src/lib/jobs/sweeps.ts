// Фоновые проходы по таблицам-очередям: чеки, письма, возвраты, напоминания,
// опрос платежей. Каждый проход берёт пачку строк, пишет попытку и итог в
// саму строку. Строка и есть состояние задачи; отдельной очереди нет.
import type { Sql } from "@/lib/db/client";
import type { Clock } from "@/ports/clock";
import type { Fiscalizer } from "@/ports/fiscal";
import type { Notifier } from "@/ports/notify";
import type { PaymentProvider } from "@/ports/payment";
import { addMinutes } from "@/domain/time";
import { renderEmail, isEmailTemplate, type EmailContext } from "@/lib/email/render";
import { loadSettings } from "@/lib/usecases/settings";
import { executeRefund } from "@/lib/usecases/cancel";
import { applyPaymentNotification } from "@/lib/usecases/payment";

export const MAX_ATTEMPTS = 5;
/** Платёж без уведомления дольше этого — спрашиваем провайдера сами. */
export const POLL_AFTER_MINUTES = 2;

const nextStatus = (attempts: number, retry: string) => (attempts >= MAX_ATTEMPTS ? "failed" : retry);

export async function sendPendingReceipts(sql: Sql, fiscal: Fiscalizer, limit = 20): Promise<number> {
  const rows = await sql<{ id: number; bookingId: number; kind: "advance" | "settle" | "refund"; amountKopecks: number; email: string; attempts: number; service: { title: string } }[]>`
    select r.id, r.booking_id, r.kind, r.amount_kopecks, r.email, r.attempts, b.service
    from receipts r join bookings b on b.id = r.booking_id
    where r.status = 'pending' order by r.id limit ${limit}`;
  for (const r of rows) {
    const res = await fiscal.send({ kind: r.kind, amountKopecks: r.amountKopecks, email: r.email, description: r.service.title, bookingId: r.bookingId });
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

export async function sendQueuedNotifications(sql: Sql, notifier: Notifier, mail: MailSettings, limit = 20): Promise<number> {
  const settings = await loadSettings(sql);
  const rows = await sql<{
    id: number; recipient: string; template: string; payload: { reason?: string }; attempts: number;
    token: string | null; service: { title: string; prepayKopecks: number } | null; startsAt: Date | null;
    doctorTitle: string | null; prepNote: string | null;
  }[]>`
    select n.id, n.recipient, n.template, n.payload, n.attempts, b.token, b.service, b.starts_at, r.title as doctor_title, s.prep_note
    from notifications n
    left join bookings b on b.id = n.booking_id
    left join resources r on r.id = b.resource_id
    left join services s on s.id = b.service_id
    where n.status = 'queued' order by n.id limit ${limit}`;
  for (const n of rows) {
    const attempts = n.attempts + 1;
    if (!isEmailTemplate(n.template) || !n.token || !n.service || !n.startsAt) {
      await sql`update notifications set status = 'failed', attempts = ${attempts}, last_error = 'нет записи или неизвестный шаблон' where id = ${n.id}`;
      continue;
    }
    const reason = n.payload.reason;
    const msg = renderEmail(n.template, {
      siteUrl: mail.siteUrl, clinic: mail.clinic, token: n.token,
      serviceTitle: n.service.title, doctorTitle: n.doctorTitle ?? "", startsAt: n.startsAt,
      prepayKopecks: n.service.prepayKopecks, arriveEarlyMinutes: settings.arriveEarlyMinutes, prepNote: n.prepNote,
      refundReason: reason === "cooling_off" || reason === "before_threshold" || reason === "by_clinic" ? reason : null,
    });
    const res = await notifier.sendEmail({ to: n.recipient, subject: msg.subject, text: msg.text });
    if (res.ok) {
      await sql`update notifications set status = 'sent', sent_at = now(), attempts = ${attempts}, last_error = null where id = ${n.id}`;
    } else {
      await sql`update notifications set status = ${nextStatus(attempts, "queued")}, attempts = ${attempts}, last_error = ${res.error} where id = ${n.id}`;
    }
  }
  return rows.length;
}

export async function retryRefunds(sql: Sql, payment: PaymentProvider, limit = 10): Promise<number> {
  const rows = await sql<{ id: number }[]>`select id from refunds
    where status in ('pending', 'failed') and attempts < ${MAX_ATTEMPTS} order by id limit ${limit}`;
  for (const r of rows) await executeRefund(sql, payment, r.id);
  return rows.length;
}

/**
 * Напоминание — один раз, подтверждённой записи, когда до приёма меньше
 * reminder_hours_before часов и больше lead_minutes. Записи, созданные уже
 * внутри этого окна, напоминания не получают: им только что пришло письмо.
 */
export async function queueReminders(sql: Sql, clock: Clock): Promise<number> {
  const now = clock.now();
  const s = await loadSettings(sql);
  const windowEnd = addMinutes(now, s.reminderHoursBefore * 60);
  const earliest = addMinutes(now, s.leadMinutes);
  const rows = await sql`insert into notifications (booking_id, recipient, template)
    select b.id, p.email, 'booking_reminder'
    from bookings b join patients p on p.id = b.patient_id
    where b.status = 'confirmed'
      and b.starts_at > ${earliest} and b.starts_at <= ${windowEnd}
      and b.created_at <= b.starts_at - make_interval(hours => ${s.reminderHoursBefore})
      and not exists (select 1 from notifications n where n.booking_id = b.id and n.template = 'booking_reminder')
    returning id`;
  return rows.length;
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
