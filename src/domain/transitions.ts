// Ось записи из 12-design-v1.md, раздел 5. Одна таблица правил: из какого
// статуса какое событие кем допустимо. Всё, чего здесь нет, — ошибка.
export const BOOKING_STATUSES = ["held", "confirmed", "done", "no_show", "cancelled", "transferred", "expired"] as const;
export type BookingStatus = (typeof BOOKING_STATUSES)[number];
export type BookingEvent = "pay" | "cancel" | "transfer" | "done" | "no_show" | "expire";
export type Actor = "patient" | "clinic" | "system";

export const STATUS_LABEL: Record<BookingStatus, string> = {
  held: "Ждёт оплаты",
  confirmed: "Подтверждена",
  done: "Приём состоялся",
  no_show: "Пациент не пришёл",
  cancelled: "Отменена",
  transferred: "Перенесена",
  expired: "Снята: не оплачена в срок",
};

const RULES: Record<BookingStatus, Partial<Record<BookingEvent, readonly Actor[]>>> = {
  held: { pay: ["system"], cancel: ["patient", "clinic"], expire: ["system"] },
  confirmed: { cancel: ["patient", "clinic"], transfer: ["patient", "clinic"], done: ["clinic"], no_show: ["clinic"] },
  done: {}, no_show: {}, cancelled: {}, transferred: {}, expired: {},
};

const NEXT: Record<BookingEvent, BookingStatus> = {
  pay: "confirmed", cancel: "cancelled", transfer: "transferred", done: "done", no_show: "no_show", expire: "expired",
};

export type TransitionResult = { ok: true; status: BookingStatus } | { ok: false; reason: string };

export function transition(status: BookingStatus, event: BookingEvent, actor: Actor): TransitionResult {
  const allowed = RULES[status][event];
  if (!allowed) return { ok: false, reason: `из состояния «${STATUS_LABEL[status]}» событие ${event} невозможно` };
  if (!allowed.includes(actor)) return { ok: false, reason: `событие ${event} недоступно для ${actor}` };
  return { ok: true, status: NEXT[event] };
}

/** Какие статусы держат ресурсы в booking_resources.active. */
export function holdsResources(status: BookingStatus): boolean {
  return status === "held" || status === "confirmed";
}
