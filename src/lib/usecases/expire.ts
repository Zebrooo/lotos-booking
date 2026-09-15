// Просроченные удержания: раз в минуту из фонового процесса. Оплата, пришедшая
// позже, не теряется — её принимает applyPaymentNotification как paid_after_expiry.
import type { Sql } from "@/lib/db/client";
import type { Clock } from "@/ports/clock";

export async function expireHolds(sql: Sql, clock: Clock): Promise<number> {
  const now = clock.now();
  return sql.begin(async tx => {
    const rows = await tx<{ id: number }[]>`update bookings set status = 'expired', hold_until = null
      where status = 'held' and hold_until < ${now} returning id`;
    if (rows.length === 0) return 0;
    const ids = rows.map(r => r.id);
    await tx`update booking_resources set active = false where booking_id in ${tx(ids)}`;
    await tx`update payments set status = 'expired' where status = 'created' and booking_id in ${tx(ids)}`;
    return ids.length;
  });
}
