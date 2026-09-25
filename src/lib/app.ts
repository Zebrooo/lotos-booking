// Сборка приложения для страниц, маршрутов и фонового цикла: база,
// адаптеры и настройки создаются один раз на процесс.
import { db, type Sql } from "@/lib/db/client";
import { loadAdapters, type Adapters } from "@/adapters";
import { appConfig, type AppConfig } from "@/lib/config";

export type App = { sql: Sql; adapters: Adapters; config: AppConfig };

let cached: App | undefined;

export function app(): App {
  cached ??= { sql: db(), adapters: loadAdapters(process.env), config: appConfig(process.env) };
  return cached;
}
