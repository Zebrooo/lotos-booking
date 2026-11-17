import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { testDb, truncateAll } from "./helpers";
import type { Sql } from "@/lib/db/client";
import { addExternalService, clinicServices, externalCategories, externalServices, importInvitroPrices, latestImport, resetServiceToExternal, updateServiceMarkup, updateServicePrice } from "@/lib/pricing/pricing";
import { publicLabCategories, publicLabServices } from "@/lib/pricing/public";

let sql: Sql;
beforeAll(() => { sql = testDb(); });
afterAll(async () => { await sql.end(); });
beforeEach(async () => {
  await truncateAll(sql);
  await sql`insert into admins (email, password_hash, role) values ('admin@example.com', 'test', 'admin')`;
});

const product = (id: string, title: string, price: number) => ({ id, bitrix_id: 10, category_bitrix_id: 20, code: "16", title, subtitle: "Описание", price, deadline: 2, available_at_home: false, additional_services: [] });
const fetchImpl = async (url: string | URL | Request) => {
  if (String(url).includes("/cities?")) return Response.json({ cities: [{ id: "city", slug: "emanjelinsk" }] });
  if (String(url).includes("/tests/?")) return Response.json({ total: 1, data: [{ category_name: "Биохимия", products: [product("a1", "Глюкоза", 215)] }] });
  return Response.json({ total: 1, data: [{ category_name: "Комплексы", products: [product("c1", "Комплекс", 1500)] }] });
};

describe("цены INVITRO", () => {
  it("сохраняет снимок, фильтрует услуги и считает наценку независимо от ручной цены", async () => {
    const run = await importInvitroPrices(sql, { fetchImpl: fetchImpl as typeof fetch });
    expect(run).toMatchObject({ status: "success", totalProducts: 2, analysesCount: 1, complexesCount: 1 });
    expect(await latestImport(sql)).toMatchObject({ id: run.id, status: "success" });
    expect((await externalServices(sql)).total).toBe(2);
    expect((await externalServices(sql, { kind: "complex" })).items.map(item => item.externalId)).toEqual(["c1"]);
    expect((await externalServices(sql, { category: "Биохимия" })).items.map(item => item.externalId)).toEqual(["a1"]);
    expect((await externalServices(sql, { availableAtHome: true })).total).toBe(0);
    expect(await externalCategories(sql)).toEqual(["Биохимия", "Комплексы"]);

    const added = await addExternalService(sql, "a1", 1);
    expect(added.created).toBe(true);
    expect((await addExternalService(sql, "a1", 1)).created).toBe(false);
    await addExternalService(sql, "c1", 1);
    await sql`insert into services (title, kind, duration_min, price_kopecks, active) values ('Приём врача', 'consultation', 30, 200000, false)`;
    expect((await clinicServices(sql, { group: "analysis" })).map(item => item.title)).toEqual(["Глюкоза"]);
    expect((await clinicServices(sql, { group: "package" })).map(item => item.title)).toEqual(["Комплекс"]);
    expect((await clinicServices(sql, { group: "doctors" })).map(item => item.title)).toEqual(["Приём врача"]);
    expect((await clinicServices(sql, { source: "own" })).map(item => item.title)).toEqual(["Приём врача"]);
    expect((await clinicServices(sql, { status: "inactive" })).map(item => item.title).sort()).toEqual(["Глюкоза", "Комплекс", "Приём врача"].sort());
    expect((await publicLabServices(sql)).total).toBe(0);

    await updateServiceMarkup(sql, { serviceId: added.serviceId, markupBp: 1000, adminId: 1 });
    let [service] = await clinicServices(sql, { source: "invitro" });
    expect(service).toMatchObject({ title: "Глюкоза", priceKopecks: 23650, sourcePriceKopecks: 21500, markupBp: 1000, active: false });
    await importInvitroPrices(sql, { fetchImpl: fetchImpl as typeof fetch });
    [service] = await clinicServices(sql, { source: "invitro" });
    expect(service).toMatchObject({ priceKopecks: 23650, markupBp: 1000 });

    await updateServicePrice(sql, { serviceId: added.serviceId, priceKopecks: 30000, prepayKopecks: 5000, durationMin: 30, active: true, adminId: 1 });
    [service] = await clinicServices(sql, { source: "invitro" });
    expect(service).toMatchObject({ priceKopecks: 30000, prepayKopecks: 5000, durationMin: 30, active: true, sourcePriceKopecks: 21500, markupBp: null });
    expect((await publicLabServices(sql, { kind: "analysis", category: "Биохимия" })).items.map(item => item.title)).toEqual(["Глюкоза"]);
    expect((await publicLabServices(sql, { kind: "complex" })).total).toBe(0);
    expect((await publicLabServices(sql, { availableAtHome: true })).total).toBe(0);
    expect(await publicLabCategories(sql)).toEqual(["Биохимия"]);
    await importInvitroPrices(sql, { fetchImpl: fetchImpl as typeof fetch });
    [service] = await clinicServices(sql, { source: "invitro" });
    expect(service).toMatchObject({ priceKopecks: 30000, markupBp: null });
    await resetServiceToExternal(sql, added.serviceId, 1);
    [service] = await clinicServices(sql, { source: "invitro" });
    expect(service).toMatchObject({ priceKopecks: 21500, prepayKopecks: 5000, active: true, markupBp: 0 });
  });

  it("при ошибке источника отмечает импорт неуспешным", async () => {
    const broken = async () => { throw new Error("offline"); };
    await expect(importInvitroPrices(sql, { fetchImpl: broken as typeof fetch })).rejects.toThrow("offline");
    expect(await latestImport(sql)).toMatchObject({ status: "failed", error: "offline" });
    expect((await externalServices(sql)).total).toBe(0);
  });
});
