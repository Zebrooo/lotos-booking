import { describe, it, expect } from "vitest";
import { workIntervals, freeSlots, isSlotFree, type Rule, type ScheduleException, type Busy } from "./slots";
import { localTime } from "./time";

const DOCTOR = 1, DEVICE = 2;
const rules: Rule[] = [
  { resourceId: DOCTOR, weekday: 2, fromMin: 540, toMin: 780 },   // вт 09:00–13:00
  { resourceId: DOCTOR, weekday: 2, fromMin: 840, toMin: 1080 },  // вт 14:00–18:00
];
const settings = { stepMin: 15, leadMinutes: 60, horizonDays: 30 };
const now = new Date("2026-09-14T00:00:00Z");
const DAY = "2026-09-15"; // вторник
const base = { rules, exceptions: [] as ScheduleException[], busy: [] as Busy[], now, settings };

describe("workIntervals", () => {
  it("по правилам будня, отсортированные", () => {
    expect(workIntervals({ resourceId: DOCTOR, day: DAY, rules, exceptions: [] })).toEqual([
      { fromMin: 540, toMin: 780 }, { fromMin: 840, toMin: 1080 },
    ]);
  });
  it("ресурс без правил доступен весь день", () => {
    expect(workIntervals({ resourceId: DEVICE, day: DAY, rules, exceptions: [] })).toEqual([{ fromMin: 0, toMin: 1440 }]);
  });
  it("off без интервала снимает день, off с интервалом вырезает", () => {
    const off: ScheduleException = { resourceId: DOCTOR, day: DAY, kind: "off", fromMin: null, toMin: null };
    expect(workIntervals({ resourceId: DOCTOR, day: DAY, rules, exceptions: [off] })).toEqual([]);
    const cut: ScheduleException = { resourceId: DOCTOR, day: DAY, kind: "off", fromMin: 720, toMin: 780 };
    expect(workIntervals({ resourceId: DOCTOR, day: DAY, rules, exceptions: [cut] })).toEqual([
      { fromMin: 540, toMin: 720 }, { fromMin: 840, toMin: 1080 },
    ]);
  });
  it("extra добавляет интервал в выходной", () => {
    const extra: ScheduleException = { resourceId: DOCTOR, day: "2026-09-20", kind: "extra", fromMin: 600, toMin: 720 };
    expect(workIntervals({ resourceId: DOCTOR, day: "2026-09-20", rules, exceptions: [extra] })).toEqual([{ fromMin: 600, toMin: 720 }]);
  });
});

describe("freeSlots", () => {
  it("30 окон по 30 минут с шагом 15 в двух интервалах", () => {
    const slots = freeSlots({ ...base, resourceIds: [DOCTOR], durationMin: 30, day: DAY });
    expect(slots).toHaveLength(30);
    expect(slots[0]!.startsAt.toISOString()).toBe("2026-09-15T04:00:00.000Z"); // 09:00 местного
    expect(slots[0]!.endsAt.toISOString()).toBe("2026-09-15T04:30:00.000Z");
  });
  it("занятость врача убирает пересекающиеся окна", () => {
    const busy: Busy[] = [{ resourceId: DOCTOR, startsAt: localTime(DAY, 540), endsAt: localTime(DAY, 570) }];
    expect(freeSlots({ ...base, busy, resourceIds: [DOCTOR], durationMin: 30, day: DAY })).toHaveLength(28);
  });
  it("занятость аппарата тоже убирает окна, хотя у аппарата нет правил", () => {
    const busy: Busy[] = [{ resourceId: DEVICE, startsAt: localTime(DAY, 600), endsAt: localTime(DAY, 660) }];
    expect(freeSlots({ ...base, busy, resourceIds: [DOCTOR, DEVICE], durationMin: 30, day: DAY })).toHaveLength(25);
  });
  it("ближайший час не предлагается", () => {
    const late = new Date("2026-09-15T04:30:00Z"); // 09:30 местного
    const slots = freeSlots({ ...base, now: late, resourceIds: [DOCTOR], durationMin: 30, day: DAY });
    expect(slots[0]!.startsAt.toISOString()).toBe("2026-09-15T05:30:00.000Z"); // 10:30
  });
  it("за горизонтом и в прошлом пусто", () => {
    expect(freeSlots({ ...base, resourceIds: [DOCTOR], durationMin: 30, day: "2026-10-20" })).toEqual([]);
    expect(freeSlots({ ...base, resourceIds: [DOCTOR], durationMin: 30, day: "2026-09-08" })).toEqual([]);
  });
  it("услуга через обед не предлагается", () => {
    const slots = freeSlots({ ...base, resourceIds: [DOCTOR], durationMin: 90, day: DAY });
    expect(slots.every(s => s.endsAt <= localTime(DAY, 780) || s.startsAt >= localTime(DAY, 840))).toBe(true);
  });
});

describe("isSlotFree", () => {
  const at = (min: number) => localTime(DAY, min);
  it("свободно", () => {
    expect(isSlotFree({ ...base, resourceIds: [DOCTOR], durationMin: 30, startsAt: at(600) })).toEqual({ ok: true });
  });
  it("вне часов работы — closed", () => {
    expect(isSlotFree({ ...base, resourceIds: [DOCTOR], durationMin: 30, startsAt: at(480) })).toEqual({ ok: false, reason: "closed" });
  });
  it("ближе часа — past", () => {
    const late = new Date("2026-09-15T04:30:00Z");
    expect(isSlotFree({ ...base, now: late, resourceIds: [DOCTOR], durationMin: 30, startsAt: at(570) })).toEqual({ ok: false, reason: "past" });
  });
  it("занято — taken", () => {
    const busy: Busy[] = [{ resourceId: DOCTOR, startsAt: at(600), endsAt: at(630) }];
    expect(isSlotFree({ ...base, busy, resourceIds: [DOCTOR], durationMin: 30, startsAt: at(615) })).toEqual({ ok: false, reason: "taken" });
  });
  it("за горизонтом — beyond_horizon", () => {
    expect(isSlotFree({ ...base, resourceIds: [DOCTOR], durationMin: 30, startsAt: localTime("2026-10-20", 600) })).toEqual({ ok: false, reason: "beyond_horizon" });
  });
});
