// tests/db/setup.ts — раз на прогон: чистая схема и все миграции.
import postgres from "postgres";
import { migrate } from "../../scripts/migrate";
export const TEST_URL = process.env.TEST_DATABASE_URL ?? "postgres://lotos:lotos@127.0.0.1:55432/lotos_test";
export default async function setup() {
  const sql = postgres(TEST_URL, { max: 1, onnotice: () => {} });
  try {
    await sql`drop schema public cascade`;
    await sql`create schema public`;
  } finally {
    await sql.end();
  }
  await migrate(TEST_URL);
}
