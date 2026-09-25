// Итог приёма ставит администратор. done — зачёт аванса и чек зачёта;
// no_show — удержание, дальше деньги учитывает клиника (09, часть 3).
import type { Sql } from "@/lib/db/client";
import type { Clock } from "@/ports/clock";
import { transition } from "@/domain/transitions";
import { canAppend, balanceKopecks, type LedgerRow } from "@/domain/money";
import { UsecaseError } from "./errors";
import { findBooking } from "./cancel";
import { queueReceipt } from "./contact";

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
    const kind = event === "done" ? "settle" : "retain";
    const ok = canAppend(rows, { kind, amountKopecks: amount });
    if (!ok.ok) throw new Error(`журнал записи ${b.id}: ${ok.reason}`);
    const [l] = await tx<{ id: number }[]>`insert into ledger (booking_id, kind, amount_kopecks, note) values (${b.id}, ${kind}, ${amount}, ${event === "done" ? "зачёт при оказании" : "неявка"}) returning id`;
    if (event === "done") {
      await queueReceipt(tx, { bookingId: b.id, kind: "settle", ledgerId: l!.id, amountKopecks: amount });
    }
  });
}

export const markDone = (sql: Sql, clock: Clock, bookingId: number) => close(sql, clock, bookingId, "done");
export const markNoShow = (sql: Sql, clock: Clock, bookingId: number) => close(sql, clock, bookingId, "no_show");
