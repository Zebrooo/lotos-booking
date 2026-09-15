// Платёж: строка payments создаётся до обращения к провайдеру, зачисление —
// только по уведомлению. Повтор уведомления безвреден (12-design-v1.md, 11).
import type { Sql, Db } from "@/lib/db/client";
import type { Clock } from "@/ports/clock";
import type { PaymentProvider, PaymentNotification } from "@/ports/payment";
import { transition, type BookingStatus } from "@/domain/transitions";
import { canAppend, type LedgerRow } from "@/domain/money";
import { UsecaseError } from "./errors";

export async function ledgerRows(sql: Db, bookingId: number): Promise<LedgerRow[]> {
  return sql<LedgerRow[]>`select kind, amount_kopecks from ledger where booking_id = ${bookingId} order by id`;
}

export async function createPayment(sql: Sql, deps: { payment: PaymentProvider; clock: Clock }, input: { token: string; returnUrl: string }): Promise<{ paymentId: number; payUrl: string }> {
  const now = deps.clock.now();
  const [b] = await sql<{ id: number; status: BookingStatus; holdUntil: Date | null; service: { title: string; prepayKopecks: number }; email: string }[]>`
    select b.id, b.status, b.hold_until, b.service, p.email from bookings b join patients p on p.id = b.patient_id where b.token = ${input.token}`;
  if (!b) throw new UsecaseError("not_found", "запись не найдена");
  if (b.status !== "held" || !b.holdUntil || b.holdUntil <= now) throw new UsecaseError("bad_status", "срок удержания истёк или запись уже не ждёт оплаты");
  const [existing] = await sql<{ id: number; payUrl: string | null }[]>`select id, pay_url from payments where booking_id = ${b.id} and status = 'created' and pay_url is not null order by id desc limit 1`;
  if (existing?.payUrl) return { paymentId: existing.id, payUrl: existing.payUrl };
  const amount = b.service.prepayKopecks;
  const [row] = await sql<{ id: number }[]>`insert into payments (booking_id, provider, amount_kopecks) values (${b.id}, ${deps.payment.name}, ${amount}) returning id`;
  try {
    const created = await deps.payment.createPayment({ paymentId: row!.id, amountKopecks: amount, description: `Предоплата: ${b.service.title}`, returnUrl: input.returnUrl, email: b.email });
    await sql`update payments set external_id = ${created.externalId}, pay_url = ${created.payUrl} where id = ${row!.id}`;
    return { paymentId: row!.id, payUrl: created.payUrl };
  } catch (e) {
    await sql`update payments set status = 'failed' where id = ${row!.id} and status = 'created'`;
    throw e;
  }
}

export type NotificationOutcome = "confirmed" | "already" | "failed" | "amount_mismatch" | "unknown" | "paid_after_expiry";

export async function applyPaymentNotification(sql: Sql, clock: Clock, input: { provider: string; notification: PaymentNotification }): Promise<{ outcome: NotificationOutcome }> {
  const now = clock.now();
  const n = input.notification;
  return sql.begin(async tx => {
    const [p] = await tx<{ id: number; bookingId: number; amountKopecks: number; status: string }[]>`
      select id, booking_id, amount_kopecks, status from payments where provider = ${input.provider} and external_id = ${n.externalId} for update`;
    if (!p) return { outcome: "unknown" as const };
    if (p.status === "paid") return { outcome: "already" as const };
    if (n.status === "failed") {
      await tx`update payments set status = 'failed', raw = ${tx.json(n.raw as never)} where id = ${p.id}`;
      return { outcome: "failed" as const };
    }
    if (n.amountKopecks !== p.amountKopecks) return { outcome: "amount_mismatch" as const };
    await tx`update payments set status = 'paid', paid_at = ${now}, raw = ${tx.json(n.raw as never)} where id = ${p.id}`;
    const [b] = await tx<{ id: number; status: BookingStatus; service: { title: string }; email: string }[]>`
      select b.id, b.status, b.service, pt.email from bookings b join patients pt on pt.id = b.patient_id where b.id = ${p.bookingId} for update`;
    const rows = await tx<LedgerRow[]>`select kind, amount_kopecks from ledger where booking_id = ${b!.id} order by id`;
    const adv: LedgerRow = { kind: "advance", amountKopecks: p.amountKopecks };
    const ok = canAppend(rows, adv);
    if (!ok.ok) throw new Error(`журнал записи ${b!.id}: ${ok.reason}`);
    const [l] = await tx<{ id: number }[]>`insert into ledger (booking_id, kind, amount_kopecks, payment_id) values (${b!.id}, 'advance', ${p.amountKopecks}, ${p.id}) returning id`;
    await tx`insert into receipts (booking_id, kind, ledger_id, amount_kopecks, email) values (${b!.id}, 'advance', ${l!.id}, ${p.amountKopecks}, ${b!.email})`;
    const t = transition(b!.status, "pay", "system");
    if (!t.ok) return { outcome: "paid_after_expiry" as const };
    await tx`update bookings set status = ${t.status}, paid_at = ${now}, hold_until = null where id = ${b!.id}`;
    await tx`insert into notifications (booking_id, recipient, template, payload) values (${b!.id}, ${b!.email}, 'booking_confirmed', ${tx.json({ title: b!.service.title })})`;
    return { outcome: "confirmed" as const };
  });
}
