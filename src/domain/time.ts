// Время клиники: Челябинск, UTC+5, перевода часов нет. Поэтому достаточно
// фиксированного смещения, без библиотек зон. В базе всё в UTC.
export const CLINIC_TZ_OFFSET = "+05:00";
export const CLINIC_TZ_OFFSET_MIN = 300;
/** Дата YYYY-MM-DD по часам клиники. */
export type IsoDay = string;
/** 1 — понедельник … 7 — воскресенье. */
export type Weekday = 1 | 2 | 3 | 4 | 5 | 6 | 7;

const MIN = 60_000;

export function localDay(at: Date): IsoDay {
  return new Date(at.getTime() + CLINIC_TZ_OFFSET_MIN * MIN).toISOString().slice(0, 10);
}

/** Минут от местной полуночи. */
export function localMinutes(at: Date): number {
  const shifted = new Date(at.getTime() + CLINIC_TZ_OFFSET_MIN * MIN);
  return shifted.getUTCHours() * 60 + shifted.getUTCMinutes();
}

/** Момент «day + minutes» по часам клиники. */
export function localTime(day: IsoDay, minutes: number): Date {
  return new Date(new Date(`${day}T00:00:00${CLINIC_TZ_OFFSET}`).getTime() + minutes * MIN);
}

export function weekday(day: IsoDay): Weekday {
  // Полдень: он в тот же день и по UTC, и по +05:00.
  const js = new Date(`${day}T12:00:00${CLINIC_TZ_OFFSET}`).getUTCDay(); // 0 = вс
  return (js === 0 ? 7 : js) as Weekday;
}

export function addDays(day: IsoDay, n: number): IsoDay {
  return localDay(new Date(localTime(day, 12 * 60).getTime() + n * 24 * 60 * MIN));
}

export function hhmm(minutes: number): string {
  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
}

export function toMinutes(s: string): number {
  return Number(s.slice(0, 2)) * 60 + Number(s.slice(3, 5));
}

export function minutesBetween(a: Date, b: Date): number {
  return (b.getTime() - a.getTime()) / MIN;
}

export function addMinutes(at: Date, n: number): Date {
  return new Date(at.getTime() + n * MIN);
}
