import type { Db } from "@/lib/db/client";

export type PublicLabService = {
  id: number;
  code: string;
  title: string;
  kind: "analysis" | "complex";
  category: string;
  priceKopecks: number;
  deadlineDays: number | null;
  availableAtHome: boolean;
  sourceUrl: string | null;
};

export async function publicLabServices(sql: Db, input: { q?: string; kind?: string; category?: string; availableAtHome?: boolean; offset?: number; limit?: number } = {}): Promise<{ total: number; items: PublicLabService[] }> {
  const q = input.q?.trim().toLowerCase() ?? "";
  const kind = input.kind === "complex" ? "complex" : input.kind === "analysis" ? "analysis" : "";
  const limit = Math.min(Math.max(input.limit ?? 24, 1), 100);
  const offset = Math.max(input.offset ?? 0, 0);
  const filter = sql`where s.active and (p.kind in ('analysis', 'complex') or (l.external_id is null and s.kind = 'analysis'))
    ${q ? sql`and (lower(s.title) like ${"%" + q + "%"} or lower(p.code) like ${"%" + q + "%"} or lower(p.category) like ${"%" + q + "%"})` : sql``}
    ${kind ? sql`and p.kind = ${kind}` : sql``}
    ${input.category ? sql`and p.category = ${input.category}` : sql``}
    ${input.availableAtHome ? sql`and p.available_at_home` : sql``}`;
  const [count] = await sql<{ total: number }[]>`select count(*)::int as total from services s
    left join service_price_links l on l.service_id = s.id
    left join external_price_products p on p.source = l.source and p.external_id = l.external_id
      and p.run_id = (select max(id) from price_import_runs where status = 'success') ${filter}`;
  const items = await sql<PublicLabService[]>`select s.id, coalesce(p.code, '') as code, s.title,
    coalesce(p.kind, 'analysis') as kind, coalesce(p.category, '') as category, s.price_kopecks,
    p.deadline_days, coalesce(p.available_at_home, false) as available_at_home, p.source_url
    from services s left join service_price_links l on l.service_id = s.id
    left join external_price_products p on p.source = l.source and p.external_id = l.external_id
      and p.run_id = (select max(id) from price_import_runs where status = 'success')
    ${filter} order by p.kind nulls last, p.category nulls last, s.title limit ${limit} offset ${offset}`;
  return { total: count?.total ?? 0, items };
}

export async function publicLabCategories(sql: Db, kind = ""): Promise<string[]> {
  const rows = await sql<{ category: string }[]>`select distinct p.category from services s
    join service_price_links l on l.service_id = s.id
    join external_price_products p on p.source = l.source and p.external_id = l.external_id
      and p.run_id = (select max(id) from price_import_runs where status = 'success')
    where s.active ${kind === "analysis" || kind === "complex" ? sql`and p.kind = ${kind}` : sql``} order by p.category`;
  return rows.map(row => row.category);
}
