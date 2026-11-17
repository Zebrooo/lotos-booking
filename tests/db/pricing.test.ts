import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { testDb, truncateAll } from "./helpers";
import type { Sql } from "@/lib/db/client";
import { addExternalService, clinicServices, externalServices, importInvitroPrices, latestImport, resetServiceToExternal, updateServicePrice } from "@/lib/pricing/pricing";

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
  it("сохраняет снимок, создаёт выключенную услугу и меняет локальную цену независимо", async () => {
    const run = await importInvitroPrices(sql, { fetchImpl: fetchImpl as typeof fetch });
    expect(run).toMatchObject({ status: "success", totalProducts: 2, analysesCount: 1, complexesCount: 1 });
    expect(await latestImport(sql)).toMatchObject({ id: run.id, status: "success" });
    expect((await externalServices(sql)).total).toBe(2);
    expect((await externalServices(sql, { kind: "complex" })).items.map(item => item.externalId)).toEqual(["c1"]);

    const added = await addExternalService(sql, "a1", 1);
    expect(added.created).toBe(true);
    expect((await addExternalService(sql, "a1", 1)).created).toBe(false);
    let [service] = await clinicServices(sql);
    expect(service).toMatchObject({ id: added.serviceId, title: "Глюкоза", priceKopecks: 21500, sourcePriceKopecks: 21500, active: false });

    await updateServicePrice(sql, { serviceId: added.serviceId, priceKopecks: 30000, prepayKopecks: 5000, durationMin: 30, active: true, adminId: 1 });
    [service] = await clinicServices(sql);
    expect(service).toMatchObject({ priceKopecks: 30000, prepayKopecks: 5000, durationMin: 30, active: true, sourcePriceKopecks: 21500 });
    await resetServiceToExternal(sql, added.serviceId, 1);
    [service] = await clinicServices(sql);
    expect(service).toMatchObject({ priceKopecks: 21500, prepayKopecks: 5000, active: true });
  });

  it("при ошибке источника отмечает импорт неуспешным", async () => {
    const broken = async () => { throw new Error("offline"); };
    await expect(importInvitroPrices(sql, { fetchImpl: broken as typeof fetch })).rejects.toThrow("offline");
    expect(await latestImport(sql)).toMatchObject({ status: "failed", error: "offline" });
    expect((await externalServices(sql)).total).toBe(0);
  });
});
