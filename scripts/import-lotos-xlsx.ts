import path from "node:path";
import { spawnSync } from "node:child_process";
import { createDb } from "../src/lib/db/client.ts";
import { importLotosCatalog, type LotosInputRow } from "../src/lib/pricing/lotos-catalog.ts";

const file = process.argv[2];
const databaseUrl = process.env.DATABASE_URL;
if (!file || !databaseUrl) {
  console.error("Использование: DATABASE_URL=... node scripts/import-lotos-xlsx.ts <файл.xlsx>");
  process.exit(1);
}
const parsed = spawnSync("python3", [path.resolve("scripts/xlsx-to-json.py"), path.resolve(file)], { encoding: "utf8", maxBuffer: 32 * 1024 * 1024 });
if (parsed.status !== 0) {
  console.error(parsed.stderr || "Не удалось прочитать XLSX");
  process.exit(1);
}
const rows = JSON.parse(parsed.stdout) as { code: string; title: string; price: string }[];
const input: LotosInputRow[] = rows.map(row => ({ code: row.code, title: row.title, priceKopecks: Number(row.price) * 100 }));
const sql = createDb(databaseUrl, 1);
try {
  const result = await importLotosCatalog(sql, input);
  console.log(`Лотос: опубликовано ${result.rows.length}; исходных ${result.total}; нулевых ${result.zero}; повторов ${result.duplicates}`);
} catch (error) {
  console.error(error);
  process.exitCode = 1;
} finally {
  await sql.end();
}
