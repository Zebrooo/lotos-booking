import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { testDb, truncateAll } from "./helpers";
import type { Sql } from "@/lib/db/client";
import { availableSlots } from "@/lib/queries/availability";
import { listCatalog } from "@/lib/queries/catalog";

let sql: Sql;
beforeAll(() => { sql = testDb(); });
afterAll(async () => { await sql.end(); });
beforeEach(async () => { await truncateAll(sql); });

const seed = async () => sql.unsafe(await readFile(path.resolve("scripts/seed-demo.sql"), "utf8"));
const clock = { now: () => new Date("2026-09-14T03:00:00Z") }; // пн 08:00 по Челябинску

describe("демо-клиника", () => {
  it("12 врачей восьми специальностей, процедурный кабинет, аппарат УЗИ, услуги и черновики согласий", async () => {
    await seed();
    const [c] = await sql<{ doctors: number; specialties: number; devices: number; services: number; rules: number }[]>`
      select (select count(*) from resources where kind = 'doctor' and specialty <> 'анализы')::int as doctors,
             (select count(distinct specialty) from resources where kind = 'doctor' and specialty <> 'анализы')::int as specialties,
             (select count(*) from resources where kind = 'device')::int as devices,
             (select count(*) from services)::int as services,
             (select count(*) from schedule_rules)::int as rules`;
    expect(c).toMatchObject({ doctors: 12, specialties: 8, devices: 1, services: 13 });
    expect(c!.rules).toBeGreaterThan(30);
    const consents = await sql<{ kind: string; body: string }[]>`select kind, body from consents order by kind`;
    expect(consents.map(x => x.kind)).toEqual(["personal_data", "prepay_terms"]);
    for (const x of consents) expect(x.body.startsWith("ЧЕРНОВИК")).toBe(true);
    const catalog = await listCatalog(sql);
    expect(catalog.services).toHaveLength(13);
    expect(catalog.services.every(s => s.doctors.length > 0)).toBe(true);
  });

  it("повторный запуск ничего не дублирует", async () => {
    await seed();
    await seed();
    const [c] = await sql<{ n: number }[]>`select count(*)::int as n from resources`;
    expect(c!.n).toBe(14);
  });

  it("у кардиолога есть окна в понедельник, у аппарата УЗИ — общая занятость", async () => {
    await seed();
    const [row] = await sql<{ serviceId: number; doctorId: number }[]>`select s.id as service_id, r.id as doctor_id
      from services s join resources r on r.title = 'Орлова Анна Сергеевна' where s.title = 'Консультация кардиолога'`;
    const days = await availableSlots(sql, clock, { serviceId: row!.serviceId, doctorId: row!.doctorId, fromDay: "2026-09-14", days: 1 });
    expect(days[0]!.slots.length).toBeGreaterThan(20);
  });
});
