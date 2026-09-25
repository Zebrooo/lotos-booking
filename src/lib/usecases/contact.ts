// Куда писать по записи. В v2 пациент оставляет только телефон: СМС и чеки
// идут на номер записавшего (представителя, если записывал он), а на почту —
// копия чека, если пациент включил её в кабинете или оставил почту при записи
// без кабинета (записи первой версии).
import type { Db } from "@/lib/db/client";
import type { SmsTemplate } from "@/lib/sms/render";

export type BookingContact = { phone: string; receiptEmail: string | null; remind: boolean };

export async function bookingContact(tx: Db, bookingId: number): Promise<BookingContact> {
  const [c] = await tx<{ phone: string; accountEmail: string | null; patientEmail: string | null; hasAccount: boolean; notifyEmail: boolean | null; notifyRemind: boolean | null }[]>`
    select coalesce(b.booker_phone, p.phone) as phone, nullif(a.email, '') as account_email, nullif(p.email, '') as patient_email,
      a.phone is not null as has_account, a.notify_email, a.notify_remind
    from bookings b join patients p on p.id = b.patient_id
    left join patient_accounts a on a.phone = coalesce(b.booker_phone, p.phone)
    where b.id = ${bookingId}`;
  if (!c) throw new Error(`запись ${bookingId} не найдена`);
  const receiptEmail = c.hasAccount ? (c.notifyEmail ? c.accountEmail ?? c.patientEmail : null) : c.patientEmail;
  return { phone: c.phone, receiptEmail, remind: c.notifyRemind ?? true };
}

/** СМС в очередь уведомлений; текст соберёт фоновый проход по свежим данным записи. */
export async function queueSms(tx: Db, bookingId: number, template: SmsTemplate, payload: Record<string, string> = {}): Promise<void> {
  const c = await bookingContact(tx, bookingId);
  await tx`insert into notifications (booking_id, channel, recipient, template, payload) values (${bookingId}, 'sms', ${c.phone}, ${template}, ${tx.json(payload)})`;
}

/** Чек в очередь кассы: на телефон и, если нужно, копией на почту. */
export async function queueReceipt(tx: Db, input: { bookingId: number; kind: "advance" | "settle" | "refund"; ledgerId: number; amountKopecks: number }): Promise<void> {
  const c = await bookingContact(tx, input.bookingId);
  await tx`insert into receipts (booking_id, kind, ledger_id, amount_kopecks, phone, email)
    values (${input.bookingId}, ${input.kind}, ${input.ledgerId}, ${input.amountKopecks}, ${c.phone}, ${c.receiptEmail})`;
}
