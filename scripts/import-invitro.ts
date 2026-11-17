import { createDb } from "../src/lib/db/client.ts";
import { importInvitroPrices } from "../src/lib/pricing/pricing.ts";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL не задан");
  process.exit(1);
}

const sql = createDb(url, 1);
try {
  const run = await importInvitroPrices(sql);
  console.log(`INVITRO: ${run.totalProducts} позиций — анализы ${run.analysesCount}, комплексы ${run.complexesCount}`);
} catch (error) {
  console.error(error);
  process.exitCode = 1;
} finally {
  await sql.end();
}
