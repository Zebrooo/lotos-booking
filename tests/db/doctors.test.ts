import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { testDb, truncateAll } from "./helpers";
import type { Sql } from "@/lib/db/client";
import { seedDemoV2 } from "../../scripts/seed-demo-v2.ts";
import { listDoctorCards, getDoctorPage } from "@/lib/queries/doctors";

let sql: Sql;
beforeAll(() => { sql = testDb(); });
afterAll(async () => { await sql.end(); });
beforeEach(async () => { await truncateAll(sql); });

const now = new Date("2026-09-24T09:20:00Z"); // чт 14:20 по Челябинску
const clock = { now: () => now };

describe("карточки врачей", () => {
  it("12 врачей в порядке прототипа, услуги с ценами, группа и ближайшее время", async () => {
    await seedDemoV2(sql, now, { staffPassword: "x" });
    const cards = await listDoctorCards(sql, clock);
    expect(cards.map(c => c.surname).slice(0, 4)).toEqual(["Жаворонкова", "Морозов", "Климова", "Белова"]);
    const zh = cards[0]!;
    expect(zh).toMatchObject({ given: "Елена Викторовна", spec: "Кардиолог", hasGroup: false });
    expect(zh.services.map(s => [s.name, s.priceKopecks])).toEqual([["Консультация кардиолога", 180000], ["УЗИ сердца (ЭхоКГ)", 260000]]);
    expect(zh.nearest).toMatch(/^(сегодня|завтра), \d\d:\d\d$/);
    expect(cards.find(c => c.surname === "Гришин")!.hasGroup).toBe(true);
  });

  it("страница врача: стаж, услуги, групповые дни с числом записей", async () => {
    await seedDemoV2(sql, now, { staffPassword: "x" });
    const cards = await listDoctorCards(sql, clock);
    const gr = await getDoctorPage(sql, clock, cards.find(c => c.surname === "Гришин")!.id);
    expect(gr).toMatchObject({ surname: "Гришин", exp: "Стаж 9 лет", room: "108" });
    expect(gr!.groupDays).toEqual([{ day: "2026-09-26", minPatients: 4, have: 2, decideAt: new Date("2026-09-25T07:00:00Z") }]);
    expect(await getDoctorPage(sql, clock, 999999)).toBeNull();
  });
});
