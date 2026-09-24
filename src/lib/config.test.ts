import { describe, it, expect } from "vitest";
import { appConfig } from "./config";

describe("appConfig", () => {
  it("в разработке — демо-значения с пометкой", () => {
    const c = appConfig({ NODE_ENV: "development" });
    expect(c.siteUrl).toBe("http://localhost:3000");
    expect(c.clinic.name).toBe("Медицинский центр «Лотос»");
    expect(c.clinic.phone).toContain("демо");
    expect(c.jobsIntervalMs).toBe(30_000);
    expect(c.jobsDisabled).toBe(false);
  });
  it("значения из окружения", () => {
    const c = appConfig({ NODE_ENV: "development", SITE_URL: "https://zapis.example.ru/", CLINIC_PHONE: "+7 351 111-22-33",
      CLINIC_ADDRESS: "Челябинск, ул. Примерная, 1", JOBS_INTERVAL_MS: "5000", JOBS_DISABLED: "1" });
    expect(c.siteUrl).toBe("https://zapis.example.ru");
    expect(c.clinic).toMatchObject({ phone: "+7 351 111-22-33", address: "Челябинск, ул. Примерная, 1" });
    expect(c.jobsIntervalMs).toBe(5000);
    expect(c.jobsDisabled).toBe(true);
  });
  it("в production без адреса сайта и контактов клиники — ошибка", () => {
    expect(() => appConfig({ NODE_ENV: "production" })).toThrow(/SITE_URL, CLINIC_ADDRESS, CLINIC_PHONE/);
  });
});
