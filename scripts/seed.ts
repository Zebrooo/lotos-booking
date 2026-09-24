// Демо-данные: node scripts/seed.ts (DATABASE_URL). Повторный запуск безопасен.
import postgres from "postgres";
import { readFile } from "node:fs/promises";
import path from "node:path";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL не задан");
  process.exit(1);
}
const sql = postgres(url, { max: 1, onnotice: n => console.log(n.message) });
try {
  await sql.unsafe(await readFile(path.resolve("scripts/seed-demo.sql"), "utf8"));
  console.log("демо-данные на месте");
} finally {
  await sql.end();
}
