import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { seedLab, testDb, truncateAll } from "./helpers";
import type { Sql } from "@/lib/db/client";
import { publicLabServices, selectedLabServices } from "@/lib/pricing/public";
import { importLotosCatalog } from "@/lib/pricing/lotos-catalog";

let sql: Sql;
beforeAll(() => { sql = testDb(); });
afterAll(async () => { await sql.end(); });
beforeEach(async () => { await truncateAll(sql); });

describe("данные каталога lab-пула", () => {
  it("выбранные услуги загружаются независимо от поиска и текущей страницы", async () => {
    const s = await seedLab(sql);
    const page = await publicLabServices(sql, { q: "Глюкоза", offset: 0, limit: 1 });
    const selected = await selectedLabServices(sql, [s.labIds[1], s.labIds[0]]);
    expect(page.items.map(item => item.id)).toEqual([s.labIds[0]]);
    expect(page.items[0]).toMatchObject({ bookable: true, durationMin: 15, prepayKopecks: 10000 });
    expect(selected.map(item => item.id)).toEqual(s.labIds);
    expect(selected.reduce((sum, item) => sum + item.priceKopecks, 0)).toBe(80000);
  });

  it("неактивные не возвращаются, а услуга без кабинета с расписанием не bookable", async () => {
    const s = await seedLab(sql);
    await sql`update services set active = false where id = ${s.labIds[1]}`;
    const [unconfigured] = await sql<{ id: number }[]>`insert into services (title, kind, duration_min, price_kopecks, prepay_kopecks)
      values ('Без кабинета', 'analysis', 15, 10000, 5000) returning id`;
    const catalog = await publicLabServices(sql);
    expect(catalog.items.map(item => item.id).sort((a, b) => a - b)).toEqual([s.labIds[0], unconfigured!.id].sort((a, b) => a - b));
    expect(catalog.items.find(item => item.id === unconfigured!.id)?.bookable).toBe(false);
    expect((await selectedLabServices(sql, s.labIds)).map(item => item.id)).toEqual([s.labIds[0]]);
  });

  it("фильтрует по основной рубрике, включая собственные услуги без внешней категории", async () => {
    const s = await seedLab(sql);
    const blood = await publicLabServices(sql, { group: "blood" });
    const hormones = await publicLabServices(sql, { group: "hormones" });
    const unknown = await publicLabServices(sql, { group: "unknown" });
    expect(blood.items.map(item => item.id).sort((a, b) => a - b)).toEqual([...s.labIds].sort((a, b) => a - b));
    expect(hormones.items).toEqual([]);
    expect(unknown.total).toBe(2);
  });

  it("импортирует XLSX как основной каталог и обновляет его без удаления истории", async () => {
    await seedLab(sql);
    const first = await importLotosCatalog(sql, [
      { code: "02-001", title: "Общий анализ крови", priceKopecks: 50000 },
      { code: "70-001", title: "общий анализ крови", priceKopecks: 13000 },
      { code: "03-001", title: "D-димер", priceKopecks: 100000 },
      { code: "00-000", title: "Не выполняется", priceKopecks: 0 },
    ]);
    expect(first).toMatchObject({ zero: 1, duplicates: 1 });
    let catalog = await publicLabServices(sql);
    expect(catalog.total).toBe(2);
    expect(catalog.items.map(item => item.code).sort()).toEqual(["02-001", "03-001"]);
    expect(catalog.items.every(item => item.bookable)).toBe(true);
    const [original] = await sql<{ id: number }[]>`select id from services where local_code = '02-001'`;
    await importLotosCatalog(sql, [
      { code: "02-001", title: "Общий анализ крови", priceKopecks: 60000 },
      { code: "06-003", title: "Аланинаминотрансфераза (АЛТ)", priceKopecks: 25000 },
    ]);
    const [updated] = await sql<{ priceKopecks: number; active: boolean }[]>`select price_kopecks, active from services where id = ${original!.id}`;
    expect(updated).toEqual({ priceKopecks: 60000, active: true });
    const [old] = await sql<{ active: boolean }[]>`select active from services where local_code = '03-001'`;
    expect(old!.active).toBe(false);
    catalog = await publicLabServices(sql);
    expect(catalog.total).toBe(2);
    expect(catalog.items.find(item => item.code === "02-001")?.priceKopecks).toBe(60000);
    expect((await publicLabServices(sql, { q: "02-001" })).items.map(item => item.id)).toEqual([original!.id]);
  });
});
