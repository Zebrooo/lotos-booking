import { describe, it, expect } from "vitest";
import { localDay, localMinutes, localTime, weekday, addDays, hhmm, toMinutes, minutesBetween, addMinutes } from "./time";

describe("время клиники, +05:00", () => {
  const late = new Date("2026-09-15T20:30:00Z"); // 01:30 следующего дня по Челябинску
  it("день и минуты считаются по часам клиники", () => {
    expect(localDay(late)).toBe("2026-09-16");
    expect(localMinutes(late)).toBe(90);
  });
  it("локальное время превращается в момент UTC", () => {
    expect(localTime("2026-09-16", 90).toISOString()).toBe("2026-09-15T20:30:00.000Z");
  });
  it("будний день: 15 сентября 2026 — вторник, 20 сентября — воскресенье", () => {
    expect(weekday("2026-09-15")).toBe(2);
    expect(weekday("2026-09-20")).toBe(7);
  });
  it("сложение дней переходит через месяц", () => {
    expect(addDays("2026-09-30", 1)).toBe("2026-10-01");
    expect(addDays("2026-10-01", -1)).toBe("2026-09-30");
  });
  it("минуты и ЧЧ:ММ взаимно обратны", () => {
    expect(hhmm(570)).toBe("09:30");
    expect(toMinutes("09:30")).toBe(570);
  });
  it("разница и сдвиг в минутах", () => {
    const a = new Date("2026-09-15T04:00:00Z");
    expect(minutesBetween(a, addMinutes(a, 45))).toBe(45);
  });
});
