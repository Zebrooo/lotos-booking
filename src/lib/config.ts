// Настройки приложения из окружения. В разработке — реквизиты из дизайна v2;
// в production без адреса сайта и реквизитов клиники запуск падает: они
// уходят пациентам в СМС, чеках и на страницы.
export type ClinicInfo = {
  name: string; legalName: string; address: string; addressNote: string; phone: string; license: string;
};
export type AppConfig = { siteUrl: string; clinic: ClinicInfo; jobsIntervalMs: number; jobsDisabled: boolean };

const REQUIRED = ["SITE_URL", "CLINIC_ADDRESS", "CLINIC_PHONE", "CLINIC_LEGAL_NAME", "CLINIC_LICENSE"] as const;

/**
 * strict (по умолчанию) — для запуска сервера. strict: false — для разметки
 * страниц, которую Next частично строит ещё при сборке, без боевого окружения.
 */
export function appConfig(env: Record<string, string | undefined>, opts: { strict?: boolean } = {}): AppConfig {
  if (opts.strict !== false && env.NODE_ENV === "production") {
    const missing = REQUIRED.filter(k => !env[k]);
    if (missing.length) throw new Error(`Не заданы ${missing.join(", ")}`);
  }
  const interval = Number(env.JOBS_INTERVAL_MS);
  return {
    siteUrl: (env.SITE_URL || "http://localhost:3000").replace(/\/+$/, ""),
    clinic: {
      name: env.CLINIC_NAME || "Медицинский центр «Лотос»",
      legalName: env.CLINIC_LEGAL_NAME || "ООО «ЦКЗ Лотос»",
      address: env.CLINIC_ADDRESS || "Еманжелинск, ул. Гагарина, 12А",
      addressNote: env.CLINIC_ADDRESS_NOTE || "регистратура на 1 этаже",
      phone: env.CLINIC_PHONE || "+7 900 023-05-50",
      license: env.CLINIC_LICENSE || "ЛО-74-01-005206 от 29.08.2019",
    },
    jobsIntervalMs: Number.isInteger(interval) && interval > 0 ? interval : 30_000,
    jobsDisabled: env.JOBS_DISABLED === "1",
  };
}
