import type { Db } from "@/lib/db/client";

export type PublicLabService = {
  id: number;
  code: string;
  title: string;
  kind: "analysis" | "complex";
  category: string;
  priceKopecks: number;
  durationMin: number;
  prepayKopecks: number;
  prepNote: string | null;
  deadlineDays: number | null;
  availableAtHome: boolean;
  sourceUrl: string | null;
  bookable: boolean;
};

const bookable = `exists (
  select 1 from service_resources sr
  join resources r on r.id = sr.resource_id
  where sr.service_id = s.id and r.kind = 'room' and r.active
    and exists (select 1 from schedule_rules where resource_id = r.id)
) and s.prepay_kopecks > 0 and s.duration_min > 0`;

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
    s.duration_min, s.prepay_kopecks, s.prep_note, p.deadline_days,
    coalesce(p.available_at_home, false) as available_at_home, p.source_url, ${sql.unsafe(bookable)} as bookable
    from services s left join service_price_links l on l.service_id = s.id
    left join external_price_products p on p.source = l.source and p.external_id = l.external_id
      and p.run_id = (select max(id) from price_import_runs where status = 'success')
    ${filter} order by p.kind nulls last, p.category nulls last, s.title limit ${limit} offset ${offset}`;
  return { total: count?.total ?? 0, items };
}

export async function selectedLabServices(sql: Db, ids: number[]): Promise<PublicLabService[]> {
  if (ids.length === 0) return [];
  return sql<PublicLabService[]>`select s.id, coalesce(p.code, '') as code, s.title,
    coalesce(p.kind, 'analysis') as kind, coalesce(p.category, '') as category, s.price_kopecks,
    s.duration_min, s.prepay_kopecks, s.prep_note, p.deadline_days,
    coalesce(p.available_at_home, false) as available_at_home, p.source_url, ${sql.unsafe(bookable)} as bookable
    from services s left join service_price_links l on l.service_id = s.id
    left join external_price_products p on p.source = l.source and p.external_id = l.external_id
      and p.run_id = (select max(id) from price_import_runs where status = 'success')
    where s.id in ${sql(ids)} and s.active
      and (p.kind in ('analysis', 'complex') or (l.external_id is null and s.kind = 'analysis'))
    order by s.id`;
}

export async function publicLabCategories(sql: Db, kind = ""): Promise<string[]> {
  const rows = await sql<{ category: string }[]>`select distinct p.category from services s
    join service_price_links l on l.service_id = s.id
    join external_price_products p on p.source = l.source and p.external_id = l.external_id
      and p.run_id = (select max(id) from price_import_runs where status = 'success')
    where s.active ${kind === "analysis" || kind === "complex" ? sql`and p.kind = ${kind}` : sql``} order by p.category`;
  return rows.map(row => row.category);
}
