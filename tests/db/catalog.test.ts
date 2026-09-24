import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { testDb, truncateAll, seedClinic } from "./helpers";
import type { Sql } from "@/lib/db/client";
import { listCatalog, getServiceWithDoctors } from "@/lib/queries/catalog";

let sql: Sql;
beforeAll(() => { sql = testDb(); });
afterAll(async () => { await sql.end(); });
beforeEach(async () => { await truncateAll(sql); });

async function withTherapist() {
  const s = await seedClinic(sql);
  const [t] = await sql<{ id: number }[]>`insert into resources (kind, title, specialty) values ('doctor', 'Сёмина Е. В.', 'терапевт') returning id`;
  const [svc] = await sql<{ id: number }[]>`insert into services (title, kind, duration_min, price_kopecks) values ('Консультация терапевта', 'consultation', 30, 150000) returning id`;
  await sql`insert into service_resources (service_id, resource_id) values (${svc!.id}, ${t!.id})`;
  return { ...s, therapistId: t!.id, therapyId: svc!.id };
}
const titles = (xs: { title: string }[]) => xs.map(x => x.title);

describe("listCatalog", () => {
  it("все активные услуги с врачами и все врачи с услугами", async () => {
    const s = await seedClinic(sql);
    const c = await listCatalog(sql);
    expect(titles(c.services)).toEqual(["Консультация кардиолога", "УЗИ сердца"]);
    expect(c.services[0]).toMatchObject({ durationMin: 30, priceKopecks: 180000, prepayKopecks: 40000 });
    expect(c.services[1]!.doctors).toEqual([{ id: s.doctorId, title: "Жаворонкова А. А.", specialty: "кардиолог" }]);
    expect(c.doctors).toEqual([{ id: s.doctorId, title: "Жаворонкова А. А.", specialty: "кардиолог",
      services: [{ id: s.consultId, title: "Консультация кардиолога" }, { id: s.uziId, title: "УЗИ сердца" }] }]);
  });

  it("неактивное не показывается: услуга, врач, услуга без активных врачей", async () => {
    const s = await withTherapist();
    await sql`update services set active = false where id = ${s.uziId}`;
    await sql`update resources set active = false where id = ${s.therapistId}`;
    const c = await listCatalog(sql);
    expect(titles(c.services)).toEqual(["Консультация кардиолога"]);
    expect(titles(c.doctors)).toEqual(["Жаворонкова А. А."]);
    expect(c.doctors[0]!.services.map(x => x.title)).toEqual(["Консультация кардиолога"]);
  });

  it("поиск по специальности, фамилии и услуге без учёта регистра и буквы ё", async () => {
    await withTherapist();
    const byRole = await listCatalog(sql, "Кардиолог");
    expect(titles(byRole.services)).toEqual(["Консультация кардиолога", "УЗИ сердца"]);
    expect(titles(byRole.doctors)).toEqual(["Жаворонкова А. А."]);
    const bySurname = await listCatalog(sql, "семина");
    expect(titles(bySurname.services)).toEqual(["Консультация терапевта"]);
    expect(titles(bySurname.doctors)).toEqual(["Сёмина Е. В."]);
    const byService = await listCatalog(sql, "узи");
    expect(titles(byService.services)).toEqual(["УЗИ сердца"]);
    expect(titles(byService.doctors)).toEqual(["Жаворонкова А. А."]);
    const none = await listCatalog(sql, "окулист");
    expect(none).toEqual({ services: [], doctors: [] });
    const blank = await listCatalog(sql, "   ");
    expect(blank.services).toHaveLength(3);
  });
});

describe("getServiceWithDoctors", () => {
  it("услуга с активными врачами; неизвестная и неактивная — null", async () => {
    const s = await seedClinic(sql);
    const svc = await getServiceWithDoctors(sql, s.uziId);
    expect(svc).toMatchObject({ id: s.uziId, title: "УЗИ сердца", durationMin: 45, doctors: [{ id: s.doctorId }] });
    expect(await getServiceWithDoctors(sql, 999999)).toBeNull();
    await sql`update services set active = false where id = ${s.uziId}`;
    expect(await getServiceWithDoctors(sql, s.uziId)).toBeNull();
  });
});
