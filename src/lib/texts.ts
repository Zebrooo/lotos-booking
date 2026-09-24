// Тексты и форматирование для пациента. Время — по часам клиники (+05:00).
// Про деньги говорим без обещаний сроков банка; про позднюю отмену — только
// через RETAIN_WORDING (docs/05-legal.md).
import type { CancelOutcome } from "@/domain/cancel";
import { type IsoDay, localDay, localMinutes, localTime, weekday, hhmm } from "@/domain/time";

const NB = " ";

export const RETAIN_WORDING = "удерживается в счёт фактически понесённых расходов клиники";

export function formatRub(kopecks: number): string {
  const rub = Math.floor(kopecks / 100);
  const kop = kopecks % 100;
  const grouped = String(rub).replace(/\B(?=(\d{3})+(?!\d))/g, NB);
  return `${grouped}${kop ? `,${String(kop).padStart(2, "0")}` : ""}${NB}₽`;
}

const WEEKDAYS = ["", "пн", "вт", "ср", "чт", "пт", "сб", "вс"];
const MONTHS = ["января", "февраля", "марта", "апреля", "мая", "июня", "июля", "августа", "сентября", "октября", "ноября", "декабря"];

export function formatDay(day: IsoDay): string {
  const [, m, d] = day.split("-").map(Number) as [number, number, number];
  return `${WEEKDAYS[weekday(day)]}, ${d} ${MONTHS[m - 1]}`;
}

export function formatTime(at: Date): string {
  return hhmm(localMinutes(at));
}

export function formatDateTime(at: Date): string {
  return `${formatDay(localDay(at))}, ${formatTime(at)}`;
}

/** Начало дня по часам клиники — для заголовков и ссылок. */
export function dayStart(day: IsoDay): Date {
  return localTime(day, 0);
}

/** Русское множественное число: plural(24, ["час", "часа", "часов"]) → «24 часа». */
export function plural(n: number, forms: [string, string, string]): string {
  const n10 = n % 10;
  const n100 = n % 100;
  const form = n10 === 1 && n100 !== 11 ? forms[0] : n10 >= 2 && n10 <= 4 && (n100 < 12 || n100 > 14) ? forms[1] : forms[2];
  return `${n} ${form}`;
}

export function cancelOutcomeText(outcome: CancelOutcome, prepayKopecks: number): string {
  const sum = formatRub(prepayKopecks);
  switch (outcome.kind) {
    case "none":
      return "Запись не оплачена, возвращать нечего.";
    case "retain":
      return `Предоплата ${sum} ${RETAIN_WORDING}.`;
    case "refund":
      switch (outcome.reason) {
        case "cooling_off":
          return `Вы оплатили меньше часа назад, поэтому предоплата ${sum} вернётся полностью. Срок зачисления зависит от банка.`;
        case "by_clinic":
          return `Приём отменяет клиника, предоплата ${sum} вернётся полностью. Срок зачисления зависит от банка.`;
        case "before_threshold":
          return `Предоплата ${sum} вернётся на карту или счёт, с которого вы платили. Срок зачисления зависит от банка.`;
      }
  }
}

export function prepayTermsText(s: { prepayKopecks: number; freeCancelHours: number; coolingOffMinutes: number }): string {
  const hours = plural(s.freeCancelHours, ["час", "часа", "часов"]);
  return [
    `Запись подтверждается после предоплаты ${formatRub(s.prepayKopecks)}; она засчитывается в стоимость приёма.`,
    `Отменить запись можно в любой момент. Если отменить раньше чем за ${hours} до приёма, предоплата вернётся.`,
    `Если позже, предоплата ${RETAIN_WORDING}.`,
    `При отмене в течение ${s.coolingOffMinutes} минут после оплаты предоплата вернётся всегда.`,
    `Перенести запись самостоятельно можно раньше чем за ${hours} до приёма, позже — по телефону клиники.`,
  ].join(" ");
}
