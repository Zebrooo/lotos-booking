import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { testDb, truncateAll } from "./helpers";
import type { Sql } from "@/lib/db/client";
import { seedDemoV2 } from "../../scripts/seed-demo-v2.ts";
import { listCatalog } from "@/lib/queries/catalog";
import { availableSlots } from "@/lib/queries/availability";
import { moneyState, type LedgerRow } from "@/domain/money";

let sql: Sql;
beforeAll(() => { sql = testDb(); });
afterAll(async () => { await sql.end(); });
beforeEach(async () => { await truncateAll(sql); });

const now = new Date("2026-09-24T09:20:00Z"); // чт 14:20 по Челябинску, как в прототипе

describe("демо-клиника v2", () => {
  it("врачи, услуги, стаж и кабинеты из прототипа", async () => {
    await seedDemoV2(sql, now, { staffPassword: "demo" });
    const c = await listCatalog(sql);
    expect(c.doctors).toHaveLength(12);
    expect(new Set(c.doctors.map(d => d.specialty)).size).toBe(8);
    const [zh] = await sql<{ experience: string; room: string }[]>`select experience, room from resources where title = 'Жаворонкова Елена Викторовна'`;
    expect(zh).toEqual({ experience: "Стаж 18 лет · высшая категория", room: "204" });
    const uzi = c.services.find(s => s.title === "УЗИ сердца (ЭхоКГ)");
    expect(uzi).toMatchObject({ durationMin: 40, priceKopecks: 260000 });
    expect(uzi!.prepNote).toContain("Специальной подготовки не нужно");
  });

  it("записи CRM на сегодня и завтра с деньгами, согласованными с журналом", async () => {
    await seedDemoV2(sql, now, { staffPassword: "demo" });
    const rows = await sql<{ status: string; n: number }[]>`select status, count(*)::int as n from bookings group by status order by status`;
    const byStatus = Object.fromEntries(rows.map(r => [r.status, r.n]));
    expect(byStatus).toMatchObject({ pending: expect.any(Number), claimed: 2, confirmed: expect.any(Number), done: expect.any(Number), arrived: 1, no_show: 1 });
    const bookings = await sql<{ id: number; status: string }[]>`select id, status from bookings`;
    for (const b of bookings) {
      const ledger = await sql<LedgerRow[]>`select kind, amount_kopecks from ledger where booking_id = ${b.id} order by id`;
      expect(moneyState(ledger)).not.toBe("inconsistent");
    }
    const [inc] = await sql<{ n: number }[]>`select count(*)::int as n from bank_incoming where matched_booking_id is null`;
    expect(inc!.n).toBe(3);
  });

  it("сотрудники трёх ролей, врач привязан к Гришину; групповой день и квота", async () => {
    await seedDemoV2(sql, now, { staffPassword: "demo" });
    const staff = await sql<{ role: string; fullName: string }[]>`select role, full_name from admins order by role`;
    expect(staff.map(s => s.role)).toEqual(["admin", "doctor", "senior"]);
    const [g] = await sql<{ day: string; minPatients: number }[]>`select to_char(day, 'YYYY-MM-DD') as day, min_patients from group_days`;
    expect(g).toEqual({ day: "2026-09-26", minPatients: 4 });
    const [q] = await sql<{ n: number }[]>`select count(*)::int as n from site_quota`;
    expect(q!.n).toBeGreaterThan(5);
  });

  it("кабинет Смирновой: двое пациентов на одном телефоне, документы, будущие и прошлые приёмы", async () => {
    await seedDemoV2(sql, now, { staffPassword: "demo" });
    const people = await sql<{ fullName: string }[]>`select full_name from patients where phone = '+79001234567' order by birth_date`;
    expect(people.map(p => p.fullName)).toEqual(["Смирнова Елена Андреевна", "Смирнова Мария Игоревна"]);
    const docs = await sql<{ kind: string }[]>`select kind from medical_documents`;
    expect(docs.map(d => d.kind).sort()).toEqual(["concl", "concl", "concl", "lab", "lab", "study"]);
    const [up] = await sql<{ n: number }[]>`select count(*)::int as n from bookings b join patients p on p.id = b.patient_id
      where p.phone = '+79001234567' and b.starts_at > ${now} and b.status in ('pending', 'confirmed')`;
    expect(up!.n).toBe(2);
  });

  it("у кардиолога есть окна, повторный запуск ничего не дублирует", async () => {
    await seedDemoV2(sql, now, { staffPassword: "demo" });
    await seedDemoV2(sql, now, { staffPassword: "demo" });
    const [zh] = await sql<{ id: number; svc: number }[]>`select r.id, s.id as svc from resources r join service_resources sr on sr.resource_id = r.id
      join services s on s.id = sr.service_id where r.title = 'Жаворонкова Елена Викторовна' and s.title = 'Консультация кардиолога'`;
    const days = await availableSlots(sql, { now: () => now }, { serviceId: zh!.svc, doctorId: zh!.id, fromDay: "2026-09-25", days: 1 });
    expect(days[0]!.slots.length).toBeGreaterThan(5);
    const [c] = await sql<{ n: number }[]>`select count(*)::int as n from resources where kind = 'doctor'`;
    expect(c!.n).toBe(12);
  });
});
