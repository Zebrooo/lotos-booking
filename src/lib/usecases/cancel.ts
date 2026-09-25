// Отмена: статус и ресурсы — сразу, в транзакции. Деньги: удержание пишется
// сразу, возврат — строкой refunds, а ledger.refund появляется после ответа
// провайдера в executeRefund (вызывает фоновая задача или администратор).
import type { Sql, Db } from "@/lib/db/client";
import type { Clock } from "@/ports/clock";
import type { PaymentProvider } from "@/ports/payment";
import { transition, type BookingStatus } from "@/domain/transitions";
import { cancelOutcome, hoursBefore, type CancelOutcome } from "@/domain/cancel";
import { canAppend, balanceKopecks, type LedgerRow } from "@/domain/money";
import { UsecaseError } from "./errors";
import { loadSettings } from "./settings";
import { queueReceipt, queueSms } from "./contact";

export type BookingRow = {
  id: number; token: string; patientId: number; status: BookingStatus; startsAt: Date; endsAt: Date;
  paidAt: Date | null; resourceId: number; serviceId: number;
  service: { title: string; durationMin: number; prepayKopecks: number }; email: string;
};

export async function findBooking(sql: Db, ref: { token?: string; bookingId?: number }, forUpdate = false): Promise<BookingRow> {
  const where = ref.token != null ? sql`b.token = ${ref.token}` : sql`b.id = ${ref.bookingId ?? 0}`;
  const rows = await sql<BookingRow[]>`select b.id, b.token, b.patient_id, b.status, b.starts_at, b.ends_at, b.paid_at, b.resource_id, b.service_id, b.service, p.email
    from bookings b join patients p on p.id = b.patient_id where ${where} ${forUpdate ? sql`for update of b` : sql``}`;
  const b = rows[0];
  if (!b) throw new UsecaseError("not_found", "запись не найдена");
  return b;
}

export async function cancelBooking(sql: Sql, clock: Clock, input: { token?: string; bookingId?: number; actor: "patient" | "clinic"; reason?: string }): Promise<{ outcome: CancelOutcome; refundId: number | null }> {
  const now = clock.now();
  const settings = await loadSettings(sql);
  return sql.begin(async tx => {
    const b = await findBooking(tx, input, true);
    const t = transition(b.status, "cancel", input.actor);
    if (!t.ok) throw new UsecaseError("bad_status", t.reason);
    const outcome = cancelOutcome({ now, startsAt: b.startsAt, paidAt: b.paidAt, actor: input.actor, settings });
    await tx`update bookings set status = 'cancelled', cancelled_by = ${input.actor}, cancelled_at = ${now}, cancel_reason = ${input.reason ?? null},
      hours_before_cancel = ${hoursBefore(now, b.startsAt).toFixed(2)}, hold_until = null where id = ${b.id}`;
    await tx`update booking_resources set active = false where booking_id = ${b.id}`;
    await tx`update payments set status = 'expired' where booking_id = ${b.id} and status = 'created'`;
    let refundId: number | null = null;
    if (outcome.kind === "refund") {
      const rows = await tx<LedgerRow[]>`select kind, amount_kopecks from ledger where booking_id = ${b.id} order by id`;
      const amount = balanceKopecks(rows);
      const [pay] = await tx<{ id: number }[]>`select id from payments where booking_id = ${b.id} and status = 'paid' order by id desc limit 1`;
      if (amount > 0 && pay) {
        const [r] = await tx<{ id: number }[]>`insert into refunds (booking_id, payment_id, amount_kopecks) values (${b.id}, ${pay.id}, ${amount}) returning id`;
        refundId = r!.id;
      }
      await queueSms(tx, b.id, "booking_cancelled_refund", { reason: outcome.reason });
    } else if (outcome.kind === "retain") {
      const rows = await tx<LedgerRow[]>`select kind, amount_kopecks from ledger where booking_id = ${b.id} order by id`;
      const amount = balanceKopecks(rows);
      const ok = canAppend(rows, { kind: "retain", amountKopecks: amount });
      if (!ok.ok) throw new Error(`журнал записи ${b.id}: ${ok.reason}`);
      await tx`insert into ledger (booking_id, kind, amount_kopecks, note) values (${b.id}, 'retain', ${amount}, 'отмена позже порога')`;
      await queueSms(tx, b.id, "booking_cancelled_retained");
    } else {
      await queueSms(tx, b.id, "booking_cancelled_unpaid");
    }
    return { outcome, refundId };
  });
}

/** Исполнить возврат у провайдера; при успехе — ledger.refund и чек возврата. Повтор безвреден. */
export async function executeRefund(sql: Sql, payment: PaymentProvider, refundId: number): Promise<{ ok: boolean }> {
  const [r] = await sql<{ id: number; bookingId: number; paymentId: number; amountKopecks: number; status: string; externalId: string | null; email: string }[]>`
    select r.id, r.booking_id, r.payment_id, r.amount_kopecks, r.status, p.external_id, pt.email
    from refunds r join payments p on p.id = r.payment_id join bookings b on b.id = r.booking_id join patients pt on pt.id = b.patient_id where r.id = ${refundId}`;
  if (!r) throw new UsecaseError("not_found", "возврат не найден");
  if (r.status === "done") return { ok: true };
  const res = await payment.refund(r.externalId ?? "", r.amountKopecks);
  if (!res.ok) {
    await sql`update refunds set status = 'failed', attempts = attempts + 1, last_error = ${res.error} where id = ${r.id}`;
    return { ok: false };
  }
  await sql.begin(async tx => {
    const rows = await tx<LedgerRow[]>`select kind, amount_kopecks from ledger where booking_id = ${r.bookingId} order by id`;
    const ok = canAppend(rows, { kind: "refund", amountKopecks: r.amountKopecks });
    if (!ok.ok) throw new Error(`журнал записи ${r.bookingId}: ${ok.reason}`);
    const [l] = await tx<{ id: number }[]>`insert into ledger (booking_id, kind, amount_kopecks, payment_id) values (${r.bookingId}, 'refund', ${r.amountKopecks}, ${r.paymentId}) returning id`;
    await queueReceipt(tx, { bookingId: r.bookingId, kind: "refund", ledgerId: l!.id, amountKopecks: r.amountKopecks });
    await tx`update refunds set status = 'done', external_id = ${res.refundId}, attempts = attempts + 1 where id = ${r.id}`;
  });
  return { ok: true };
}
