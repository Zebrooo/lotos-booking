// Просроченное: раз в минуту из фонового процесса.
// held — удержание на время оплаты по ссылке; истекло — окно свободно молча:
//   пациент ушёл со страницы оплаты, СМС ему не нужно.
// pending — бронь «оплатить до 17:00»; срок прошёл — снимаем и пишем СМС.
// claimed («оплата заявлена») не снимаем: деньги могли прийти, ждём сверки.
// Оплата, пришедшая позже, не теряется — её принимает applyPaymentNotification.
import type { Sql } from "@/lib/db/client";
import type { Clock } from "@/ports/clock";
import { queueSms } from "./contact";

export async function expireHolds(sql: Sql, clock: Clock): Promise<number> {
  const now = clock.now();
  return sql.begin(async tx => {
    const held = await tx<{ id: number }[]>`update bookings set status = 'expired', hold_until = null
      where status = 'held' and hold_until < ${now} returning id`;
    const pending = await tx<{ id: number }[]>`update bookings set status = 'expired'
      where status = 'pending' and pay_deadline < ${now} returning id`;
    const ids = [...held, ...pending].map(r => r.id);
    if (ids.length === 0) return 0;
    await tx`update booking_resources set active = false where booking_id in ${tx(ids)}`;
    await tx`update payments set status = 'expired' where status = 'created' and booking_id in ${tx(ids)}`;
    for (const p of pending) await queueSms(tx, p.id, "booking_expired");
    return ids.length;
  });
}
