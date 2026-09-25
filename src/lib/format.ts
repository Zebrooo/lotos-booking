// Форматы дат, времени и денег как в прототипах v2. Время — по часам клиники.
import { type IsoDay, addDays, localDay, localMinutes, weekday, hhmm } from "@/domain/time";

const WD = ["", "пн", "вт", "ср", "чт", "пт", "сб", "вс"];
const MON = ["января", "февраля", "марта", "апреля", "мая", "июня", "июля", "августа", "сентября", "октября", "ноября", "декабря"];

/** «1 800 ₽» — как n.toLocaleString('ru-RU') + ' ₽' в прототипе. */
export function rub(kopecks: number): string {
  return Math.round(kopecks / 100).toLocaleString("ru-RU") + " ₽";
}

export const plural = (n: number, a: string, b: string, c: string) => {
  const x = n % 10, y = n % 100;
  return x === 1 && y !== 11 ? a : x >= 2 && x <= 4 && (y < 10 || y >= 20) ? b : c;
};

export function relName(day: IsoDay, today: IsoDay): string {
  return day === today ? "сегодня" : day === addDays(today, 1) ? "завтра" : "";
}
export const wdShort = (day: IsoDay) => WD[weekday(day)]!;
export const monGen = (day: IsoDay) => MON[Number(day.slice(5, 7)) - 1]!;
export const monShort = (day: IsoDay) => monGen(day).slice(0, 3);
/** «2 октября». */
export const dateNum = (day: IsoDay) => `${Number(day.slice(8, 10))} ${monGen(day)}`;
/** «завтра, 25 сентября» или «26 сентября». */
export function dayLong(day: IsoDay, today: IsoDay): string {
  const r = relName(day, today);
  return (r ? r + ", " : "") + dateNum(day);
}
export const hhmmOf = (at: Date) => hhmm(localMinutes(at));
/** «сегодня, 15:40» или «сб, 26 сентября, 10:00». */
export function nearestLabel(at: Date, today: IsoDay): string {
  const day = localDay(at);
  return (relName(day, today) || `${wdShort(day)}, ${dateNum(day)}`) + ", " + hhmmOf(at);
}
export function splitName(full: string): { surname: string; given: string } {
  const p = full.split(" ");
  return { surname: p[0] ?? "", given: p.slice(1).join(" ") };
}
/** «Жаворонкова Е. В.». */
export function shortName(full: string): string {
  const p = full.split(" ");
  return [p[0], ...p.slice(1).map(x => x[0] + ".")].join(" ");
}
