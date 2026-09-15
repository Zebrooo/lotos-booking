// Свободные окна: правила недели × исключения × занятость × длительность.
// Чистые функции без базы. Запись занимает все ресурсы услуги: врача и,
// если нужен, аппарат или кабинет — так один аппарат не продаётся дважды.
import { type IsoDay, type Weekday, localDay, localMinutes, localTime, weekday, addMinutes, addDays } from "./time";

export type Rule = { resourceId: number; weekday: Weekday; fromMin: number; toMin: number };
export type ScheduleException = {
  resourceId: number; day: IsoDay; kind: "off" | "extra";
  /** Пусто у off — снят весь день. */
  fromMin: number | null; toMin: number | null;
};
export type Busy = { resourceId: number; startsAt: Date; endsAt: Date };
export type SlotSettings = { stepMin: number; leadMinutes: number; horizonDays: number };
export type Slot = { startsAt: Date; endsAt: Date };
export type Interval = { fromMin: number; toMin: number };

type Common = {
  resourceIds: readonly number[]; durationMin: number;
  rules: readonly Rule[]; exceptions: readonly ScheduleException[]; busy: readonly Busy[];
  now: Date; settings: SlotSettings;
};

/** Интервалы работы ресурса в день. Ресурс без правил вовсе доступен весь день. */
export function workIntervals(input: { resourceId: number; day: IsoDay; rules: readonly Rule[]; exceptions: readonly ScheduleException[] }): Interval[] {
  const { resourceId, day } = input;
  const own = input.rules.filter(r => r.resourceId === resourceId);
  const wd = weekday(day);
  let intervals: Interval[] = own.length === 0
    ? [{ fromMin: 0, toMin: 24 * 60 }]
    : own.filter(r => r.weekday === wd).map(r => ({ fromMin: r.fromMin, toMin: r.toMin }));
  for (const ex of input.exceptions) {
    if (ex.resourceId !== resourceId || ex.day !== day) continue;
    if (ex.kind === "extra") {
      if (ex.fromMin != null && ex.toMin != null) intervals.push({ fromMin: ex.fromMin, toMin: ex.toMin });
      continue;
    }
    if (ex.fromMin == null || ex.toMin == null) { intervals = []; continue; }
    const cut: Interval = { fromMin: ex.fromMin, toMin: ex.toMin };
    intervals = intervals.flatMap(it => subtract(it, cut));
  }
  return intervals.filter(it => it.toMin > it.fromMin).sort((a, b) => a.fromMin - b.fromMin);
}

function subtract(it: Interval, cut: Interval): Interval[] {
  if (cut.toMin <= it.fromMin || cut.fromMin >= it.toMin) return [it];
  const out: Interval[] = [];
  if (cut.fromMin > it.fromMin) out.push({ fromMin: it.fromMin, toMin: cut.fromMin });
  if (cut.toMin < it.toMin) out.push({ fromMin: cut.toMin, toMin: it.toMin });
  return out;
}

const overlaps = (aS: Date, aE: Date, bS: Date, bE: Date) => aS < bE && bS < aE;
const inside = (intervals: Interval[], fromMin: number, toMin: number) =>
  intervals.some(it => fromMin >= it.fromMin && toMin <= it.toMin);

function anyBusy(input: Common, startsAt: Date, endsAt: Date): boolean {
  return input.resourceIds.some(id =>
    input.busy.some(b => b.resourceId === id && overlaps(startsAt, endsAt, b.startsAt, b.endsAt)));
}

export function freeSlots(input: Common & { day: IsoDay }): Slot[] {
  const { resourceIds, durationMin, day, now, settings } = input;
  if (resourceIds.length === 0 || !Number.isInteger(durationMin) || durationMin <= 0) return [];
  if (!Number.isInteger(settings.stepMin) || settings.stepMin <= 0) return [];
  const today = localDay(now);
  if (day < today || day > addDays(today, settings.horizonDays)) return [];
  const earliest = addMinutes(now, settings.leadMinutes);
  const perResource = resourceIds.map(id => workIntervals({ resourceId: id, day, rules: input.rules, exceptions: input.exceptions }));
  const primary = perResource[0] ?? [];
  const out: Slot[] = [];
  for (const it of primary) {
    for (let t = it.fromMin; t + durationMin <= it.toMin; t += settings.stepMin) {
      const startsAt = localTime(day, t);
      if (startsAt < earliest) continue;
      if (!perResource.every(iv => inside(iv, t, t + durationMin))) continue;
      const endsAt = addMinutes(startsAt, durationMin);
      if (anyBusy(input, startsAt, endsAt)) continue;
      out.push({ startsAt, endsAt });
    }
  }
  return out;
}

export type SlotCheck = { ok: true } | { ok: false; reason: "closed" | "past" | "beyond_horizon" | "taken" };

/** Последний рубеж перед удержанием: то же правило, что у freeSlots. */
export function isSlotFree(input: Common & { startsAt: Date }): SlotCheck {
  const { resourceIds, durationMin, startsAt, now, settings } = input;
  if (resourceIds.length === 0 || !Number.isInteger(durationMin) || durationMin <= 0) return { ok: false, reason: "closed" };
  if (startsAt < addMinutes(now, settings.leadMinutes)) return { ok: false, reason: "past" };
  const day = localDay(startsAt);
  if (day > addDays(localDay(now), settings.horizonDays)) return { ok: false, reason: "beyond_horizon" };
  const fromMin = localMinutes(startsAt);
  for (const id of resourceIds) {
    const iv = workIntervals({ resourceId: id, day, rules: input.rules, exceptions: input.exceptions });
    if (!inside(iv, fromMin, fromMin + durationMin)) return { ok: false, reason: "closed" };
  }
  if (anyBusy(input, startsAt, addMinutes(startsAt, durationMin))) return { ok: false, reason: "taken" };
  return { ok: true };
}
