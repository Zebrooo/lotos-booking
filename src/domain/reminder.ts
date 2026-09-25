// Когда напомнить о приёме по СМС (дизайн v2, экран «Готово»): накануне около
// 12:00; если приём завтра, а полдень уже прошёл, — сегодня в 18:00; если
// приём сегодня или вечер накануне прошёл — не напоминаем, хватает СМС о записи.
import { addDays, localDay, localTime } from "./time";

export function reminderAt(input: { now: Date; startsAt: Date }): Date | null {
  const visitDay = localDay(input.startsAt);
  const eve = addDays(visitDay, -1);
  const noon = localTime(eve, 12 * 60);
  if (noon > input.now) return noon;
  const evening = localTime(eve, 18 * 60);
  if (localDay(input.now) === eve && evening > input.now) return evening;
  return null;
}
