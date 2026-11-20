import type { Sql } from "@/lib/db/client";

export type LotosInputRow = { code: string; title: string; priceKopecks: number };
export type LotosSelection = { rows: LotosInputRow[]; total: number; zero: number; duplicates: number };

export function normalizeLotosTitle(title: string): string {
  return title.toLowerCase().replaceAll("ё", "е").replace(/[^\p{L}\p{N}]+/gu, " ").trim();
}

export function selectLotosRows(input: LotosInputRow[]): LotosSelection {
  const rows: LotosInputRow[] = [];
  const seen = new Set<string>();
  let zero = 0;
  let duplicates = 0;
  for (const raw of input) {
    const row = { code: raw.code.trim(), title: raw.title.trim(), priceKopecks: Math.round(raw.priceKopecks) };
    if (!row.code || !row.title || !Number.isFinite(row.priceKopecks)) continue;
    if (row.priceKopecks <= 0) { zero++; continue; }
    const key = normalizeLotosTitle(row.title);
    if (seen.has(key)) { duplicates++; continue; }
    seen.add(key);
    rows.push(row);
  }
  return { rows, total: input.length, zero, duplicates };
}

export async function importLotosCatalog(sql: Sql, input: LotosInputRow[]): Promise<LotosSelection> {
  const selected = selectLotosRows(input);
  await sql.begin(async tx => {
    await tx`update services set active = false where kind = 'analysis'`;
    let [room] = await tx<{ id: number }[]>`select id from resources where kind = 'room' and active order by id limit 1`;
    if (!room) {
      [room] = await tx<{ id: number }[]>`insert into resources (kind, title) values ('room', 'Процедурный кабинет') returning id`;
    }
    const rules = await tx`select 1 from schedule_rules where resource_id = ${room!.id} limit 1`;
    if (rules.length === 0) {
      for (let weekday = 1; weekday <= 7; weekday++) {
        await tx`insert into schedule_rules (resource_id, weekday, from_min, to_min) values (${room!.id}, ${weekday}, 480, 780)`;
      }
    }
    for (const row of selected.rows) {
      const [service] = await tx<{ id: number }[]>`insert into services (title, kind, duration_min, price_kopecks, prepay_kopecks, active, local_code)
        values (${row.title}, 'analysis', 15, ${row.priceKopecks}, ${Math.min(row.priceKopecks, 40000)}, true, ${row.code})
        on conflict (local_code) do update set title = excluded.title, price_kopecks = excluded.price_kopecks,
          prepay_kopecks = excluded.prepay_kopecks, active = true
        returning id`;
      await tx`insert into service_resources (service_id, resource_id) values (${service!.id}, ${room!.id}) on conflict do nothing`;
    }
  });
  return selected;
}
