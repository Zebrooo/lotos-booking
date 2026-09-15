// scripts/migrate.ts — запуск: node scripts/migrate.ts (Node 22+ исполняет .ts без сборки)
import postgres from "postgres";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

export async function migrate(databaseUrl: string, dir = path.resolve("migrations")): Promise<string[]> {
  const sql = postgres(databaseUrl, { max: 1, onnotice: () => {} });
  try {
    await sql`create table if not exists schema_migrations (name text primary key, applied_at timestamptz not null default now())`;
    const files = (await readdir(dir)).filter(f => f.endsWith(".sql")).sort();
    const applied = new Set((await sql<{ name: string }[]>`select name from schema_migrations`).map(r => r.name));
    const done: string[] = [];
    for (const f of files) {
      if (applied.has(f)) continue;
      const body = await readFile(path.join(dir, f), "utf8");
      await sql.begin(async tx => {
        await tx.unsafe(body);
        await tx`insert into schema_migrations (name) values (${f})`;
      });
      done.push(f);
    }
    return done;
  } finally {
    await sql.end();
  }
}

const isMain = process.argv[1] ? path.resolve(process.argv[1]) === fileURLToPath(import.meta.url) : false;
if (isMain) {
  const url = process.env.DATABASE_URL;
  if (!url) { console.error("DATABASE_URL не задан"); process.exit(1); }
  migrate(url)
    .then(d => console.log(d.length ? `применено: ${d.join(", ")}` : "новых миграций нет"))
    .catch(e => { console.error(e); process.exit(1); });
}
