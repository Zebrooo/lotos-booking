import { describe, it, expect } from "vitest";
import { reminderAt } from "./reminder";
import { reminderLabel } from "@/lib/format";
import { localTime } from "./time";

const at = (day: string, h: number, m = 0) => localTime(day, h * 60 + m);
const iso = (d: Date | null) => d?.toISOString() ?? null;

describe("напоминание по СМС", () => {
  it("накануне около 12:00", () => {
    expect(iso(reminderAt({ now: at("2026-09-24", 14, 20), startsAt: at("2026-10-02", 10) }))).toBe(iso(at("2026-10-01", 12)));
    expect(reminderLabel({ now: at("2026-09-24", 14, 20), startsAt: at("2026-10-02", 10) })).toBe("1 октября около 12:00");
  });
  it("приём завтра, полдень прошёл — сегодня вечером в 18:00", () => {
    expect(iso(reminderAt({ now: at("2026-09-24", 14, 20), startsAt: at("2026-09-25", 9) }))).toBe(iso(at("2026-09-24", 18)));
    expect(reminderLabel({ now: at("2026-09-24", 14, 20), startsAt: at("2026-09-25", 9) })).toBe("сегодня вечером");
  });
  it("приём завтра, записались до полудня — завтра не нужно, накануне в 12:00", () => {
    expect(reminderLabel({ now: at("2026-09-24", 9), startsAt: at("2026-09-25", 9) })).toBe("сегодня около 12:00");
  });
  it("приём сегодня или вечер накануне уже прошёл — не напоминаем", () => {
    expect(reminderAt({ now: at("2026-09-24", 14), startsAt: at("2026-09-24", 16) })).toBeNull();
    expect(reminderAt({ now: at("2026-09-24", 18, 30), startsAt: at("2026-09-25", 9) })).toBeNull();
    expect(reminderLabel({ now: at("2026-09-24", 18, 30), startsAt: at("2026-09-25", 9) })).toBeNull();
  });
});
