// Итог приёма ставит администратор. done — зачёт аванса и чек зачёта;
// no_show — полный возврат по опубликованной оферте.
import type { Sql } from "@/lib/db/client";
import type { Clock } from "@/ports/clock";
import { transition } from "@/domain/transitions";
import { canAppend, balanceKopecks, type LedgerRow } from "@/domain/money";
import { UsecaseError } from "./errors";
import { advanceSource, findBooking } from "./cancel";
import { queueReceipt, queueSms } from "./contact";

async function close(sql: Sql, clock: Clock, bookingId: number, event: "done" | "no_show"): Promise<void> {
  void clock.now();
  await sql.begin(async tx => {
    const b = await findBooking(tx, { bookingId }, true);
    const t = transition(b.status, event, "clinic");
    if (!t.ok) throw new UsecaseError("bad_status", t.reason);
    await tx`update bookings set status = ${t.status} where id = ${b.id}`;
    await tx`update booking_resources set active = false where booking_id = ${b.id}`;
    const rows = await tx<LedgerRow[]>`select kind, amount_kopecks from ledger where booking_id = ${b.id} order by id`;
    const amount = balanceKopecks(rows);
    if (amount <= 0) return;
    if (event === "done") {
      const ok = canAppend(rows, { kind: "settle", amountKopecks: amount });
      if (!ok.ok) throw new Error(`журнал записи ${b.id}: ${ok.reason}`);
      const [l] = await tx<{ id: number }[]>`insert into ledger (booking_id, kind, amount_kopecks, note) values (${b.id}, 'settle', ${amount}, 'зачёт при оказании') returning id`;
      await queueReceipt(tx, { bookingId: b.id, kind: "settle", ledgerId: l!.id, amountKopecks: amount });
    } else {
      const src = await advanceSource(tx, b.id);
      const method: "provider" | "cash" | "bank" = src.paymentId ? "provider" : src.channel === "cash" ? "cash" : "bank";
      await tx`insert into refunds (booking_id, payment_id, amount_kopecks, method) values (${b.id}, ${src.paymentId}, ${amount}, ${method})`;
      await queueSms(tx, b.id, "booking_cancelled_refund", { reason: "by_clinic", method });
    }
  });
}

export const markDone = (sql: Sql, clock: Clock, bookingId: number) => close(sql, clock, bookingId, "done");
export const markNoShow = (sql: Sql, clock: Clock, bookingId: number) => close(sql, clock, bookingId, "no_show");
