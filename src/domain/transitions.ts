// Ось записи (docs/15-plan-v2.md). Одна таблица правил: из какого статуса
// какое событие кем допустимо. Всё, чего здесь нет, — ошибка.
//
// held      — окно удержано, ждём код из СМС и онлайн-оплату;
// pending   — бронь: время закреплено, оплата наличными или по ссылке до срока;
// claimed   — пациент сообщил об оплате, администратор сверяет; сама не снимается;
// confirmed — аванс получен; arrived — пришёл, документы подписаны.
export const BOOKING_STATUSES = [
  "held", "pending", "claimed", "confirmed", "arrived", "done", "no_show", "cancelled", "transferred", "expired",
] as const;
export type BookingStatus = (typeof BOOKING_STATUSES)[number];
export type BookingEvent = "pay" | "reserve" | "claim" | "cancel" | "transfer" | "arrive" | "done" | "no_show" | "expire";
export type Actor = "patient" | "clinic" | "system";

export const STATUS_LABEL: Record<BookingStatus, string> = {
  held: "Ждёт оплаты",
  pending: "Ждёт оплаты",
  claimed: "Оплата заявлена",
  confirmed: "Подтверждена",
  arrived: "Пришёл, документы",
  done: "Приём состоялся",
  no_show: "Неявка",
  cancelled: "Отменена",
  transferred: "Перенесена",
  expired: "Снята: не оплачена в срок",
};

const LIVE_ACTORS = ["patient", "clinic"] as const;
const RULES: Record<BookingStatus, Partial<Record<BookingEvent, readonly Actor[]>>> = {
  held: { pay: ["system"], reserve: ["system"], cancel: LIVE_ACTORS, expire: ["system"] },
  pending: { pay: ["system", "clinic"], claim: LIVE_ACTORS, cancel: LIVE_ACTORS, transfer: LIVE_ACTORS, expire: ["system"] },
  claimed: { pay: ["system", "clinic"], cancel: LIVE_ACTORS, transfer: LIVE_ACTORS },
  confirmed: { cancel: LIVE_ACTORS, transfer: LIVE_ACTORS, arrive: ["clinic"], done: ["clinic"], no_show: ["clinic"] },
  arrived: { done: ["clinic"] },
  done: {}, no_show: {}, cancelled: {}, transferred: {}, expired: {},
};

const NEXT: Record<BookingEvent, BookingStatus> = {
  pay: "confirmed", reserve: "pending", claim: "claimed", cancel: "cancelled", transfer: "transferred",
  arrive: "arrived", done: "done", no_show: "no_show", expire: "expired",
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
  return status === "held" || status === "pending" || status === "claimed" || status === "confirmed" || status === "arrived";
}
