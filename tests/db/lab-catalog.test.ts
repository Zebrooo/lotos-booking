import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { seedLab, testDb, truncateAll } from "./helpers";
import type { Sql } from "@/lib/db/client";
import { publicLabServices, selectedLabServices } from "@/lib/pricing/public";

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
});
