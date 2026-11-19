import { describe, it, expect } from "vitest";
import { loadAdapters } from "./index";

describe("loadAdapters", () => {
  it("в разработке заглушки по умолчанию", () => {
    const a = loadAdapters({ NODE_ENV: "development" });
    expect(a.payment.name).toBe("fake");
    expect(a.fiscal.name).toBe("log");
    expect(a.notify.name).toBe("log");
  });
  it("пустые значения в .env — как незаданные", () => {
    const a = loadAdapters({ NODE_ENV: "development", PAYMENT_PROVIDER: "", FISCALIZER: "", NOTIFIER: "" });
    expect([a.payment.name, a.fiscal.name, a.notify.name]).toEqual(["fake", "log", "log"]);
  });
  it("СМС: заглушка в лог по умолчанию, в production запрещена", () => {
    expect(loadAdapters({ NODE_ENV: "development" }).sms.name).toBe("log");
    expect(() => loadAdapters({ NODE_ENV: "production", PAYMENT_PROVIDER: "real", SMS_PROVIDER: "log" })).toThrow(/SMS_PROVIDER/);
  });
  it("SMSC требует API-ключ и зарегистрированное имя отправителя", () => {
    expect(() => loadAdapters({ NODE_ENV: "development", SMS_PROVIDER: "smsc" })).toThrow(/SMSC_API_KEY/);
    const a = loadAdapters({ NODE_ENV: "development", SMS_PROVIDER: "smsc", SMSC_API_KEY: "key", SMSC_SENDER: "LOTOS" });
    expect(a.sms.name).toBe("smsc");
  });
  it("SMS.ru требует API-ключ и зарегистрированное имя отправителя", () => {
    expect(() => loadAdapters({ NODE_ENV: "development", SMS_PROVIDER: "smsru" })).toThrow(/SMSRU_API_ID/);
    const a = loadAdapters({ NODE_ENV: "development", SMS_PROVIDER: "smsru", SMSRU_API_ID: "key", SMSRU_SENDER: "LOTOS_EMAN" });
    expect(a.sms.name).toBe("smsru");
  });
  it("заглушка платежей в production запрещена без явного разрешения", () => {
    expect(() => loadAdapters({ NODE_ENV: "production", PAYMENT_PROVIDER: "fake" })).toThrow(/PAYMENT_PROVIDER=fake/);
    const a = loadAdapters({ NODE_ENV: "production", PAYMENT_PROVIDER: "fake", ALLOW_DEMO_PAYMENTS: "1", SMS_PROVIDER: "smsc", SMSC_API_KEY: "key", SMSC_SENDER: "LOTOS" });
    expect(a.payment.name).toBe("fake");
  });
  it("почта через SMTP требует SMTP_URL и MAIL_FROM", () => {
    expect(() => loadAdapters({ NODE_ENV: "development", NOTIFIER: "smtp" })).toThrow(/SMTP_URL/);
    const a = loadAdapters({ NODE_ENV: "development", NOTIFIER: "smtp", SMTP_URL: "smtp://127.0.0.1:2525", MAIL_FROM: "zapis@example.ru" });
    expect(a.notify.name).toBe("smtp");
  });
  it("неизвестный поставщик — ошибка", () => {
    expect(() => loadAdapters({ NODE_ENV: "development", PAYMENT_PROVIDER: "nobody" })).toThrow(/PAYMENT_PROVIDER/);
  });
});
