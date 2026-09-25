import { describe, it, expect } from "vitest";
import { transition, holdsResources, BOOKING_STATUSES, STATUS_LABEL } from "./transitions";

describe("переходы записи v2", () => {
  it("удержание: оплата онлайн подтверждает, бронь переводит в «ждёт оплаты»", () => {
    expect(transition("held", "pay", "system")).toEqual({ ok: true, status: "confirmed" });
    expect(transition("held", "reserve", "system")).toEqual({ ok: true, status: "pending" });
    expect(transition("held", "pay", "patient").ok).toBe(false);
  });
  it("бронь: оплата по ссылке или наличными, заявленная оплата, истечение", () => {
    expect(transition("pending", "pay", "system")).toEqual({ ok: true, status: "confirmed" });
    expect(transition("pending", "pay", "clinic")).toEqual({ ok: true, status: "confirmed" });
    expect(transition("pending", "claim", "patient")).toEqual({ ok: true, status: "claimed" });
    expect(transition("pending", "expire", "system")).toEqual({ ok: true, status: "expired" });
    expect(transition("claimed", "pay", "clinic")).toEqual({ ok: true, status: "confirmed" });
  });
  it("заявленная оплата сама не снимается", () => {
    expect(transition("claimed", "expire", "system").ok).toBe(false);
  });
  it("удержание истекает только системой", () => {
    expect(transition("held", "expire", "system")).toEqual({ ok: true, status: "expired" });
    expect(transition("confirmed", "expire", "system").ok).toBe(false);
  });
  it("отменить можно из удержания, брони, заявленной оплаты и подтверждённой", () => {
    for (const s of ["held", "pending", "claimed", "confirmed"] as const) {
      expect(transition(s, "cancel", "patient")).toEqual({ ok: true, status: "cancelled" });
      expect(transition(s, "cancel", "clinic")).toEqual({ ok: true, status: "cancelled" });
    }
    expect(transition("confirmed", "cancel", "system").ok).toBe(false);
  });
  it("перенос из брони, заявленной оплаты и подтверждённой; из удержания нельзя", () => {
    for (const s of ["pending", "claimed", "confirmed"] as const) {
      expect(transition(s, "transfer", "patient")).toEqual({ ok: true, status: "transferred" });
    }
    expect(transition("held", "transfer", "patient").ok).toBe(false);
  });
  it("приход, приём и неявку отмечает только клиника", () => {
    expect(transition("confirmed", "arrive", "clinic")).toEqual({ ok: true, status: "arrived" });
    expect(transition("arrived", "done", "clinic")).toEqual({ ok: true, status: "done" });
    expect(transition("confirmed", "done", "clinic")).toEqual({ ok: true, status: "done" });
    expect(transition("confirmed", "no_show", "clinic")).toEqual({ ok: true, status: "no_show" });
    expect(transition("confirmed", "arrive", "patient").ok).toBe(false);
    expect(transition("pending", "arrive", "clinic").ok).toBe(false);
  });
  it("из конечных статусов выхода нет", () => {
    for (const s of ["done", "no_show", "cancelled", "transferred", "expired"] as const) {
      for (const e of ["pay", "reserve", "claim", "cancel", "transfer", "arrive", "done", "no_show", "expire"] as const) {
        expect(transition(s, e, "clinic").ok).toBe(false);
      }
    }
  });
  it("ресурсы держат живые записи", () => {
    expect(BOOKING_STATUSES.filter(holdsResources)).toEqual(["held", "pending", "claimed", "confirmed", "arrived"]);
  });
  it("подписи как в CRM дизайна", () => {
    expect(STATUS_LABEL.pending).toBe("Ждёт оплаты");
    expect(STATUS_LABEL.claimed).toBe("Оплата заявлена");
    expect(STATUS_LABEL.arrived).toBe("Пришёл, документы");
    expect(STATUS_LABEL.no_show).toBe("Неявка");
    expect(STATUS_LABEL.transferred).toBe("Перенесена");
  });
});
