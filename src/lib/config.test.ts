import { describe, it, expect } from "vitest";
import { appConfig } from "./config";

describe("appConfig", () => {
  it("в разработке — реквизиты из дизайна v2", () => {
    const c = appConfig({ NODE_ENV: "development" });
    expect(c.siteUrl).toBe("http://localhost:3000");
    expect(c.clinic).toEqual({
      name: "Медицинский центр «Лотос»", legalName: "ООО «ЦКЗ Лотос»", address: "Еманжелинск, ул. Гагарина, 12А",
      addressNote: "регистратура на 1 этаже", phone: "+7 900 023-05-50", license: "ЛО-74-01-005206 от 29.08.2019",
    });
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
  it("в production без адреса сайта и реквизитов клиники — ошибка", () => {
    expect(() => appConfig({ NODE_ENV: "production" })).toThrow(/SITE_URL, CLINIC_ADDRESS, CLINIC_PHONE, CLINIC_LEGAL_NAME, CLINIC_LICENSE/);
  });
  it("мягкий режим для отображения не падает при сборке", () => {
    const c = appConfig({ NODE_ENV: "production" }, { strict: false });
    expect(c.clinic.legalName).toBe("ООО «ЦКЗ Лотос»");
  });
  it("пустые значения в .env считаются незаданными", () => {
    const c = appConfig({ NODE_ENV: "development", CLINIC_NAME: "", CLINIC_PHONE: "", SITE_URL: "", JOBS_INTERVAL_MS: "" });
    expect(c.clinic.name).toBe("Медицинский центр «Лотос»");
    expect(c.clinic.phone).toBe("+7 900 023-05-50");
    expect(c.siteUrl).toBe("http://localhost:3000");
  });
});
