import { describe, it, expect } from "vitest";
import { cancelOutcome, canTransfer, holdUntil, hoursBefore } from "./cancel";

const settings = { freeCancelHours: 24, coolingOffMinutes: 60 };
const startsAt = new Date("2026-09-17T05:00:00Z"); // 10:00 местного 17 сентября

describe("cancelOutcome", () => {
  it("не оплачено — возвращать нечего", () => {
    expect(cancelOutcome({ now: new Date("2026-09-16T05:00:00Z"), startsAt, paidAt: null, actor: "patient", settings }))
      .toEqual({ kind: "none", reason: "not_paid" });
  });
  it("клиника отменяет — всегда возврат", () => {
    expect(cancelOutcome({ now: new Date("2026-09-17T04:00:00Z"), startsAt, paidAt: new Date("2026-09-10T00:00:00Z"), actor: "clinic", settings }))
      .toEqual({ kind: "refund", reason: "by_clinic" });
  });
  it("час на размышление после оплаты — возврат даже впритык к приёму", () => {
    const paidAt = new Date("2026-09-17T03:30:00Z");
    expect(cancelOutcome({ now: new Date("2026-09-17T04:20:00Z"), startsAt, paidAt, actor: "patient", settings }))
      .toEqual({ kind: "refund", reason: "cooling_off" });
  });
  it("раньше порога — возврат, ровно на пороге тоже", () => {
    const paidAt = new Date("2026-09-10T00:00:00Z");
    expect(cancelOutcome({ now: new Date("2026-09-15T05:00:00Z"), startsAt, paidAt, actor: "patient", settings }).kind).toBe("refund");
    expect(cancelOutcome({ now: new Date("2026-09-16T05:00:00Z"), startsAt, paidAt, actor: "patient", settings }))
      .toEqual({ kind: "refund", reason: "before_threshold" });
  });
  it("позже порога — удержание", () => {
    const paidAt = new Date("2026-09-10T00:00:00Z");
    expect(cancelOutcome({ now: new Date("2026-09-16T05:01:00Z"), startsAt, paidAt, actor: "patient", settings }))
      .toEqual({ kind: "retain", reason: "after_threshold" });
  });
});

describe("hoursBefore и canTransfer", () => {
  it("часов до приёма", () => {
    expect(hoursBefore(new Date("2026-09-16T05:00:00Z"), startsAt)).toBe(24);
  });
  it("пациент переносит до порога, клиника всегда", () => {
    expect(canTransfer({ now: new Date("2026-09-16T04:00:00Z"), startsAt, actor: "patient", settings })).toBe(true);
    expect(canTransfer({ now: new Date("2026-09-16T06:00:00Z"), startsAt, actor: "patient", settings })).toBe(false);
    expect(canTransfer({ now: new Date("2026-09-17T04:00:00Z"), startsAt, actor: "clinic", settings })).toBe(true);
  });
});

describe("holdUntil", () => {
  const hold = { holdMinutes: 15, leadMinutes: 60 };
  it("обычно now + 15 минут", () => {
    expect(holdUntil({ now: new Date("2026-09-16T05:00:00Z"), startsAt, settings: hold }).toISOString()).toBe("2026-09-16T05:15:00.000Z");
  });
  it("но не позже, чем за час до приёма", () => {
    expect(holdUntil({ now: new Date("2026-09-17T03:50:00Z"), startsAt, settings: hold }).toISOString()).toBe("2026-09-17T04:00:00.000Z");
  });
});

describe("порог 0 часов — возврат всегда, как в дизайне v2", () => {
  const zero = { freeCancelHours: 0, coolingOffMinutes: 60 };
  it("за час до приёма — возврат, перенос пациентом разрешён", () => {
    const paidAt = new Date("2026-09-10T00:00:00Z");
    expect(cancelOutcome({ now: new Date("2026-09-17T04:00:00Z"), startsAt, paidAt, actor: "patient", settings: zero }))
      .toEqual({ kind: "refund", reason: "before_threshold" });
    expect(canTransfer({ now: new Date("2026-09-17T04:00:00Z"), startsAt, actor: "patient", settings: zero })).toBe(true);
  });
});
