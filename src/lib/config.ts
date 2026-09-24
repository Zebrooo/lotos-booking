// Настройки приложения из окружения. В разработке — демо-значения с явной
// пометкой, в production без адреса сайта и контактов клиники запуск падает:
// эти данные уходят пациентам в письмах.
export type ClinicInfo = { name: string; address: string; phone: string };
export type AppConfig = { siteUrl: string; clinic: ClinicInfo; jobsIntervalMs: number; jobsDisabled: boolean };

export function appConfig(env: Record<string, string | undefined>): AppConfig {
  if (env.NODE_ENV === "production") {
    const missing = ["SITE_URL", "CLINIC_ADDRESS", "CLINIC_PHONE"].filter(k => !env[k]);
    if (missing.length) throw new Error(`Не заданы ${missing.join(", ")}`);
  }
  const interval = Number(env.JOBS_INTERVAL_MS);
  return {
    siteUrl: (env.SITE_URL ?? "http://localhost:3000").replace(/\/+$/, ""),
    clinic: {
      name: env.CLINIC_NAME ?? "Медицинский центр «Лотос»",
      address: env.CLINIC_ADDRESS ?? "Челябинск (демо-адрес)",
      phone: env.CLINIC_PHONE ?? "+7 351 000-00-00 (демо)",
    },
    jobsIntervalMs: Number.isInteger(interval) && interval > 0 ? interval : 30_000,
    jobsDisabled: env.JOBS_DISABLED === "1",
  };
}
