import type { Db, Sql } from "@/lib/db/client";
import { fetchInvitroCatalog, type InvitroProduct } from "./invitro-client.ts";

export type ImportSummary = { id: number; status: string; totalProducts: number; analysesCount: number; complexesCount: number; startedAt: Date; finishedAt: Date | null; error: string | null };

export async function importInvitroPrices(sql: Sql, options: { fetchImpl?: typeof fetch; pageSize?: number } = {}): Promise<ImportSummary> {
  const [run] = await sql<ImportSummary[]>`insert into price_import_runs (source, city_slug, city_external_id)
    values ('invitro', 'emanjelinsk', 'pending') returning id, status, total_products as total_products, analyses_count, complexes_count, started_at, finished_at, error`;
  try {
    const catalog = await fetchInvitroCatalog({ fetchImpl: options.fetchImpl, pageSize: options.pageSize, pauseMs: options.fetchImpl ? 0 : 150 });
    await sql`update price_import_runs set city_external_id = ${catalog.cityExternalId} where id = ${run!.id}`;
    await sql.begin(async tx => {
      for (const product of catalog.products) await upsertProduct(tx, run!.id, product);
      await tx`update services s set price_kopecks = round(p.price_kopecks * (10000 + l.markup_bp) / 10000.0)
        from service_price_links l join external_price_products p on p.source = l.source and p.external_id = l.external_id
        where l.service_id = s.id and l.markup_bp is not null and p.run_id = ${run!.id}`;
      const analyses = catalog.products.filter(product => product.kind === "analysis").length;
      const complexes = catalog.products.length - analyses;
      await tx`update price_import_runs set status = 'success', total_products = ${catalog.products.length},
        analyses_count = ${analyses}, complexes_count = ${complexes}, finished_at = now(), error = null where id = ${run!.id}`;
    });
  } catch (error) {
    await sql`update price_import_runs set status = 'failed', error = ${error instanceof Error ? error.message.slice(0, 1000) : "Неизвестная ошибка"}, finished_at = now() where id = ${run!.id}`;
    throw error;
  }
  const [done] = await sql<ImportSummary[]>`select id, status, total_products, analyses_count, complexes_count, started_at, finished_at, error from price_import_runs where id = ${run!.id}`;
  return done!;
}

async function upsertProduct(sql: Db, runId: number, product: InvitroProduct): Promise<void> {
  await sql`insert into external_price_products (run_id, source, external_id, bitrix_id, kind, code, title, category, description,
    price_kopecks, deadline_days, available_at_home, additional_services, source_url, payload)
    values (${runId}, 'invitro', ${product.externalId}, ${product.bitrixId}, ${product.kind}, ${product.code}, ${product.title}, ${product.category},
      ${product.description}, ${product.priceKopecks}, ${product.deadlineDays}, ${product.availableAtHome}, ${sql.json(product.additionalServices as never)},
      ${product.sourceUrl}, ${sql.json(product.payload as never)})
    on conflict (source, external_id) do update set run_id = excluded.run_id, bitrix_id = excluded.bitrix_id, kind = excluded.kind,
      code = excluded.code, title = excluded.title, category = excluded.category, description = excluded.description,
      price_kopecks = excluded.price_kopecks, deadline_days = excluded.deadline_days, available_at_home = excluded.available_at_home,
      additional_services = excluded.additional_services, source_url = excluded.source_url, payload = excluded.payload, imported_at = now()`;
}

export async function latestImport(sql: Db): Promise<ImportSummary | null> {
  const [run] = await sql<ImportSummary[]>`select id, status, total_products, analyses_count, complexes_count, started_at, finished_at, error
    from price_import_runs order by id desc limit 1`;
  return run ?? null;
}

export type ClinicService = {
  id: number; title: string; kind: string; durationMin: number; priceKopecks: number; prepayKopecks: number; active: boolean;
  externalId: string | null; externalKind: "analysis" | "complex" | null; sourcePriceKopecks: number | null; sourceUrl: string | null; markupBp: number | null;
};

export type ServiceGroup = "doctors" | "analysis" | "package";

export async function clinicServices(sql: Db, input: { q?: string; group?: ServiceGroup; status?: string; source?: string } = {}): Promise<ClinicService[]> {
  const query = input.q?.trim().toLowerCase() ?? "";
  return sql<ClinicService[]>`select s.id, s.title, s.kind, s.duration_min, s.price_kopecks, s.prepay_kopecks, s.active,
    l.external_id, p.kind as external_kind, p.price_kopecks as source_price_kopecks, p.source_url, l.markup_bp
    from services s left join service_price_links l on l.service_id = s.id
    left join external_price_products p on p.source = l.source and p.external_id = l.external_id
      and p.run_id = (select max(id) from price_import_runs where status = 'success')
    where true
    ${query ? sql`and lower(s.title) like ${"%" + query + "%"}` : sql``}
    ${input.group === "doctors" ? sql`and l.external_id is null and s.kind <> 'analysis'` : sql``}
    ${input.group === "analysis" ? sql`and (p.kind = 'analysis' or (l.external_id is null and s.kind = 'analysis'))` : sql``}
    ${input.group === "package" ? sql`and p.kind = 'complex'` : sql``}
    ${input.status === "active" ? sql`and s.active` : input.status === "inactive" ? sql`and not s.active` : sql``}
    ${input.source === "invitro" ? sql`and l.external_id is not null` : input.source === "own" ? sql`and l.external_id is null` : sql``}
    order by s.active desc, s.title limit 500`;
}

export type ExternalService = {
  externalId: string; kind: "analysis" | "complex"; code: string; title: string; category: string; priceKopecks: number;
  deadlineDays: number | null; availableAtHome: boolean; sourceUrl: string; serviceId: number | null;
};

export async function externalServices(sql: Db, input: { q?: string; kind?: string; category?: string; availableAtHome?: boolean; offset?: number; limit?: number } = {}): Promise<{ total: number; items: ExternalService[] }> {
  const q = input.q?.trim().toLowerCase() ?? "";
  const kind = input.kind === "analysis" || input.kind === "complex" ? input.kind : "";
  const limit = Math.min(Math.max(input.limit ?? 50, 1), 100);
  const offset = Math.max(input.offset ?? 0, 0);
  const run = sql`select max(id) from price_import_runs where status = 'success'`;
  const filter = sql`where p.run_id = (${run}) ${kind ? sql`and p.kind = ${kind}` : sql``}
    ${q ? sql`and (lower(p.title) like ${"%" + q + "%"} or lower(p.code) like ${"%" + q + "%"} or lower(p.category) like ${"%" + q + "%"})` : sql``}
    ${input.category ? sql`and p.category = ${input.category}` : sql``}
    ${input.availableAtHome ? sql`and p.available_at_home` : sql``}`;
  const [count] = await sql<{ total: number }[]>`select count(*)::int as total from external_price_products p ${filter}`;
  const items = await sql<ExternalService[]>`select p.external_id, p.kind, p.code, p.title, p.category, p.price_kopecks,
    p.deadline_days, p.available_at_home, p.source_url, l.service_id from external_price_products p
    left join service_price_links l on l.source = p.source and l.external_id = p.external_id
    ${filter} order by p.kind, p.category, p.title limit ${limit} offset ${offset}`;
  return { total: count?.total ?? 0, items };
}

export async function externalCategories(sql: Db, kind = ""): Promise<string[]> {
  const rows = await sql<{ category: string }[]>`select distinct category from external_price_products
    where run_id = (select max(id) from price_import_runs where status = 'success')
    ${kind === "analysis" || kind === "complex" ? sql`and kind = ${kind}` : sql``} order by category`;
  return rows.map(row => row.category);
}

export async function addExternalService(sql: Sql, externalId: string, adminId: number): Promise<{ serviceId: number; created: boolean }> {
  return sql.begin(async tx => {
    const [existing] = await tx<{ serviceId: number }[]>`select service_id from service_price_links where source = 'invitro' and external_id = ${externalId}`;
    if (existing) return { serviceId: existing.serviceId, created: false };
    const [p] = await tx<ExternalService[]>`select external_id, kind, code, title, category, price_kopecks, deadline_days, available_at_home, source_url,
      null::bigint as service_id from external_price_products where source = 'invitro' and external_id = ${externalId}
      and run_id = (select max(id) from price_import_runs where status = 'success')`;
    if (!p) throw new Error("Позиция INVITRO не найдена в последнем успешном импорте");
    const [same] = await tx<{ id: number }[]>`select id from services where lower(title) = lower(${p.title}) order by id limit 1`;
    let serviceId = same?.id;
    if (!serviceId) {
      const [service] = await tx<{ id: number }[]>`insert into services (title, kind, duration_min, price_kopecks, prepay_kopecks, active)
        values (${p.title}, 'analysis', 15, ${p.priceKopecks}, 0, false) returning id`;
      serviceId = service!.id;
    }
    await tx`insert into service_price_links (service_id, source, external_id, markup_bp) values (${serviceId}, 'invitro', ${externalId}, 0)`;
    await tx`insert into audit (admin_id, action, booking_id, details) values (${adminId}, 'price_external_linked', null, ${tx.json({ externalId, serviceId } as never)})`;
    return { serviceId, created: !same };
  });
}

export async function updateServicePrice(sql: Sql, input: { serviceId: number; priceKopecks: number; prepayKopecks: number; durationMin: number; active: boolean; adminId: number }): Promise<void> {
  if (!Number.isSafeInteger(input.priceKopecks) || input.priceKopecks < 0 || !Number.isSafeInteger(input.prepayKopecks) || input.prepayKopecks < 0) throw new Error("Цены должны быть неотрицательными целыми числами копеек");
  if (input.prepayKopecks > input.priceKopecks) throw new Error("Предоплата не может быть больше цены");
  if (!Number.isSafeInteger(input.durationMin) || input.durationMin < 5 || input.durationMin > 480) throw new Error("Длительность должна быть от 5 до 480 минут");
  await sql.begin(async tx => {
    const result = await tx`update services set price_kopecks = ${input.priceKopecks}, prepay_kopecks = ${input.prepayKopecks},
      duration_min = ${input.durationMin}, active = ${input.active} where id = ${input.serviceId} returning id`;
    if (result.length === 0) throw new Error("Услуга не найдена");
    await tx`update service_price_links set markup_bp = null where service_id = ${input.serviceId}`;
    await tx`insert into audit (admin_id, action, booking_id, details) values (${input.adminId}, 'price_service_updated', null,
      ${tx.json({ serviceId: input.serviceId, priceKopecks: input.priceKopecks, prepayKopecks: input.prepayKopecks, durationMin: input.durationMin, active: input.active } as never)})`;
  });
}

export async function updateServiceMarkup(sql: Sql, input: { serviceId: number; markupBp: number; adminId: number }): Promise<void> {
  if (!Number.isSafeInteger(input.markupBp) || input.markupBp < 0 || input.markupBp > 100000) throw new Error("Наценка должна быть от 0 до 1000% с шагом 0,01%");
  await sql.begin(async tx => {
    const result = await tx`update service_price_links l set markup_bp = ${input.markupBp}
      from external_price_products p
      where l.service_id = ${input.serviceId} and p.source = l.source and p.external_id = l.external_id
        and p.run_id = (select max(id) from price_import_runs where status = 'success')
      returning l.service_id`;
    if (result.length === 0) throw new Error("Услуга не связана с действующей позицией INVITRO");
    await tx`update services s set price_kopecks = round(p.price_kopecks * (10000 + ${input.markupBp}) / 10000.0)
      from service_price_links l join external_price_products p on p.source = l.source and p.external_id = l.external_id
      where l.service_id = s.id and s.id = ${input.serviceId}
        and p.run_id = (select max(id) from price_import_runs where status = 'success')`;
    await tx`insert into audit (admin_id, action, booking_id, details) values (${input.adminId}, 'price_markup_updated', null,
      ${tx.json({ serviceId: input.serviceId, markupBp: input.markupBp } as never)})`;
  });
}

export async function resetServiceToExternal(sql: Sql, serviceId: number, adminId: number): Promise<void> {
  await sql.begin(async tx => {
    await tx`update service_price_links set markup_bp = 0 where service_id = ${serviceId}`;
    const result = await tx`update services s set price_kopecks = p.price_kopecks from service_price_links l
      join external_price_products p on p.source = l.source and p.external_id = l.external_id
        and p.run_id = (select max(id) from price_import_runs where status = 'success')
      where l.service_id = s.id and s.id = ${serviceId} returning s.id`;
    if (result.length === 0) throw new Error("Услуга не связана с действующей позицией INVITRO");
    await tx`insert into audit (admin_id, action, booking_id, details) values (${adminId}, 'price_external_applied', null, ${tx.json({ serviceId } as never)})`;
  });
}
