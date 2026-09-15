import { describe, it, expect } from "vitest";
import { transition, holdsResources, BOOKING_STATUSES } from "./transitions";

describe("переходы записи", () => {
  it("оплата подтверждает удержанную запись, и только системой", () => {
    expect(transition("held", "pay", "system")).toEqual({ ok: true, status: "confirmed" });
    expect(transition("held", "pay", "patient").ok).toBe(false);
  });
  it("удержание истекает только системой", () => {
    expect(transition("held", "expire", "system")).toEqual({ ok: true, status: "expired" });
    expect(transition("confirmed", "expire", "system").ok).toBe(false);
  });
  it("отменить может пациент и клиника из held и confirmed", () => {
    expect(transition("held", "cancel", "patient")).toEqual({ ok: true, status: "cancelled" });
    expect(transition("confirmed", "cancel", "clinic")).toEqual({ ok: true, status: "cancelled" });
    expect(transition("confirmed", "cancel", "system").ok).toBe(false);
  });
  it("перенос только из confirmed", () => {
    expect(transition("confirmed", "transfer", "patient")).toEqual({ ok: true, status: "transferred" });
    expect(transition("held", "transfer", "patient").ok).toBe(false);
  });
  it("итог приёма ставит только клиника", () => {
    expect(transition("confirmed", "done", "clinic")).toEqual({ ok: true, status: "done" });
    expect(transition("confirmed", "no_show", "clinic")).toEqual({ ok: true, status: "no_show" });
    expect(transition("confirmed", "done", "patient").ok).toBe(false);
  });
  it("из конечных статусов выхода нет", () => {
    for (const s of ["done", "no_show", "cancelled", "transferred", "expired"] as const) {
      for (const e of ["pay", "cancel", "transfer", "done", "no_show", "expire"] as const) {
        expect(transition(s, e, "clinic").ok).toBe(false);
      }
    }
  });
  it("ресурсы держат только held и confirmed", () => {
    expect(BOOKING_STATUSES.filter(holdsResources)).toEqual(["held", "confirmed"]);
  });
});
