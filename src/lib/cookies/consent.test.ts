import { describe, expect, it } from "vitest";
import { COOKIE_CONSENT_VERSION, newCookieChoice, parseCookieChoice } from "./consent";

describe("выбор cookies", () => {
  it("сохраняет разрешение и запрет аналитики", () => {
    const accepted = newCookieChoice(true, new Date("2026-11-17T10:00:00Z"));
    const rejected = newCookieChoice(false, new Date("2026-11-17T10:00:00Z"));
    expect(parseCookieChoice(JSON.stringify(accepted))).toEqual(accepted);
    expect(parseCookieChoice(JSON.stringify(rejected))).toEqual(rejected);
    expect(accepted.version).toBe(COOKIE_CONSENT_VERSION);
  });

  it("отклоняет повреждённые, неизвестные и слишком длинные значения", () => {
    expect(parseCookieChoice("not-json")).toBeNull();
    expect(parseCookieChoice(JSON.stringify({ necessary: true, analytics: "yes", version: 1, updatedAt: "2026-11-17" }))).toBeNull();
    expect(parseCookieChoice(JSON.stringify({ necessary: true, analytics: true, version: 999, updatedAt: "2026-11-17" }))).toBeNull();
    expect(parseCookieChoice("x".repeat(501))).toBeNull();
  });
});
