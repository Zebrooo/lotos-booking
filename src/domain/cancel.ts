// Порог отмены (12-design-v1.md, раздел 6): до порога возврат, после —
// удержание в счёт фактических расходов. Кнопка отмены работает всегда,
// здесь считается только последствие.
import { minutesBetween, addMinutes } from "./time";
import type { Actor } from "./transitions";

export type CancelSettings = { freeCancelHours: number; coolingOffMinutes: number };
export type HoldSettings = { holdMinutes: number; leadMinutes: number };

export type CancelOutcome =
  | { kind: "none"; reason: "not_paid" }
  | { kind: "refund"; reason: "cooling_off" | "before_threshold" | "by_clinic" }
  | { kind: "retain"; reason: "after_threshold" };

export function hoursBefore(now: Date, startsAt: Date): number {
  return minutesBetween(now, startsAt) / 60;
}

export function cancelOutcome(input: { now: Date; startsAt: Date; paidAt: Date | null; actor: Actor; settings: CancelSettings }): CancelOutcome {
  const { now, startsAt, paidAt, actor, settings } = input;
  if (paidAt === null) return { kind: "none", reason: "not_paid" };
  if (actor === "clinic") return { kind: "refund", reason: "by_clinic" };
  if (minutesBetween(paidAt, now) <= settings.coolingOffMinutes) return { kind: "refund", reason: "cooling_off" };
  if (hoursBefore(now, startsAt) >= settings.freeCancelHours) return { kind: "refund", reason: "before_threshold" };
  return { kind: "retain", reason: "after_threshold" };
}

export function canTransfer(input: { now: Date; startsAt: Date; actor: Actor; settings: Pick<CancelSettings, "freeCancelHours"> }): boolean {
  if (input.actor === "clinic") return true;
  return hoursBefore(input.now, input.startsAt) >= input.settings.freeCancelHours;
}

/** Срок удержания: now + holdMinutes, но не позже чем за leadMinutes до приёма. */
export function holdUntil(input: { now: Date; startsAt: Date; settings: HoldSettings }): Date {
  const byHold = addMinutes(input.now, input.settings.holdMinutes);
  const byStart = addMinutes(input.startsAt, -input.settings.leadMinutes);
  return byHold < byStart ? byHold : byStart;
}
