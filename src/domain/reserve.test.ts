import { describe, it, expect } from "vitest";
import { reserveDeadline } from "./reserve";
import { localTime } from "./time";

const settings = { deadlineMin: 17 * 60, minLeadMinutes: 60, beforeVisitMinutes: 120, deskOpensMin: 8 * 60 };
const at = (day: string, hhmm: string) => localTime(day, Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3)));
const iso = (d: Date | null) => d?.toISOString() ?? null;

describe("reserveDeadline — срок оплаты брони", () => {
  it("днём — сегодня до 17:00", () => {
    expect(iso(reserveDeadline({ now: at("2026-09-24", "14:20"), startsAt: at("2026-09-26", "11:00"), settings })))
      .toBe(iso(at("2026-09-24", "17:00")));
  });
  it("позже 16:00 — завтра до 17:00", () => {
    expect(iso(reserveDeadline({ now: at("2026-09-24", "16:30"), startsAt: at("2026-09-28", "10:00"), settings })))
      .toBe(iso(at("2026-09-25", "17:00")));
  });
  it("воскресенье касса закрыта — срок переезжает на понедельник", () => {
    expect(iso(reserveDeadline({ now: at("2026-09-26", "16:30"), startsAt: at("2026-09-30", "10:00"), settings })))
      .toBe(iso(at("2026-09-28", "17:00")));
  });
  it("за 2 часа до приёма, если это раньше 17:00", () => {
    expect(iso(reserveDeadline({ now: at("2026-09-24", "14:20"), startsAt: at("2026-09-24", "17:00"), settings })))
      .toBe(iso(at("2026-09-24", "15:00")));
  });
  it("приём слишком скоро — брони нет", () => {
    expect(reserveDeadline({ now: at("2026-09-24", "14:20"), startsAt: at("2026-09-24", "16:00"), settings })).toBeNull();
  });
  it("срок выпадает до открытия кассы — брони нет", () => {
    expect(reserveDeadline({ now: at("2026-09-24", "16:30"), startsAt: at("2026-09-25", "09:00"), settings })).toBeNull();
  });
  it("ровно к открытию кассы — можно", () => {
    expect(iso(reserveDeadline({ now: at("2026-09-26", "16:30"), startsAt: at("2026-09-28", "10:00"), settings })))
      .toBe(iso(at("2026-09-28", "08:00")));
  });
  it("свой календарь кассы", () => {
    const closedFriday = (day: string) => day !== "2026-09-25";
    expect(iso(reserveDeadline({ now: at("2026-09-24", "16:30"), startsAt: at("2026-09-30", "10:00"), settings, deskOpen: closedFriday })))
      .toBe(iso(at("2026-09-26", "17:00")));
  });
});
