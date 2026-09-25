// Срок оплаты брони (дизайн v2, «Забронировать, оплатить до …»): самое раннее
// из двух ограничителей — ближайшие 17:00 рабочего дня кассы, но не раньше
// чем через час, и за два часа до приёма. Если срок наступает раньше чем
// через 30 минут или до открытия кассы, бронь недоступна: платить онлайн.
import { type IsoDay, localDay, localTime, weekday, addDays, addMinutes, localMinutes } from "./time";

export type ReserveSettings = { deadlineMin: number; minLeadMinutes: number; beforeVisitMinutes: number; deskOpensMin: number };

/** Касса по умолчанию работает с понедельника по субботу. */
export const defaultDeskOpen = (day: IsoDay) => weekday(day) !== 7;

export function reserveDeadline(input: {
  now: Date; startsAt: Date; settings: ReserveSettings; deskOpen?: (day: IsoDay) => boolean;
}): Date | null {
  const { now, startsAt, settings } = input;
  const deskOpen = input.deskOpen ?? defaultDeskOpen;
  let day = localDay(now);
  if (!deskOpen(day) || addMinutes(now, settings.minLeadMinutes) > localTime(day, settings.deadlineMin)) {
    day = addDays(day, 1);
    for (let i = 0; i < 14 && !deskOpen(day); i++) day = addDays(day, 1);
  }
  let deadline = localTime(day, settings.deadlineMin);
  const beforeVisit = addMinutes(startsAt, -settings.beforeVisitMinutes);
  if (beforeVisit < deadline) deadline = beforeVisit;
  if (deadline < addMinutes(now, 30)) return null;
  if (localMinutes(deadline) < settings.deskOpensMin) return null;
  return deadline;
}
