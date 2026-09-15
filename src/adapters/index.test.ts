import { describe, it, expect } from "vitest";
import { loadAdapters } from "./index";

describe("loadAdapters", () => {
  it("в разработке заглушки по умолчанию", () => {
    const a = loadAdapters({ NODE_ENV: "development" });
    expect(a.payment.name).toBe("fake");
    expect(a.fiscal.name).toBe("log");
    expect(a.notify.name).toBe("log");
  });
  it("заглушка платежей в production запрещена", () => {
    expect(() => loadAdapters({ NODE_ENV: "production", PAYMENT_PROVIDER: "fake" })).toThrow(/production/);
  });
  it("неизвестный поставщик — ошибка", () => {
    expect(() => loadAdapters({ NODE_ENV: "development", PAYMENT_PROVIDER: "nobody" })).toThrow(/PAYMENT_PROVIDER/);
  });
});
