// Запуск фонового цикла в процессе сервера Next (см. src/instrumentation.ts).
import { app } from "@/lib/app";
import { startRunner } from "./runner";

export function startAppRunner(): void {
  const { sql, adapters, config } = app();
  if (config.jobsDisabled) return;
  startRunner({ sql, clock: adapters.clock, payment: adapters.payment, fiscal: adapters.fiscal, notify: adapters.notify,
    mail: { siteUrl: config.siteUrl, clinic: config.clinic } }, config.jobsIntervalMs);
  console.info(`[фон] цикл запущен, шаг ${config.jobsIntervalMs} мс`);
}
