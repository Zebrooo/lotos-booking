import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { testDb, truncateAll, seedClinic } from "./helpers";
import type { Sql } from "@/lib/db/client";
import { availableSlots } from "@/lib/queries/availability";
import { holdSlot } from "@/lib/usecases/hold";
import { localTime } from "@/domain/time";

let sql: Sql;
beforeAll(() => { sql = testDb(); });
afterAll(async () => { await sql.end(); });
beforeEach(async () => { await truncateAll(sql); });

const clock = { now: () => new Date("2026-09-14T06:00:00Z") }; // пн 11:00 по Челябинску
const patient = { fullName: "Иванов Иван Иванович", birthDate: "1980-01-01", phone: "+79000000001", email: "ivanov@example.com" };
const counts = (days: { day: string; slots: unknown[] }[]) => Object.fromEntries(days.map(d => [d.day, d.slots.length]));

describe("availableSlots", () => {
  it("окна по дням недели: сегодня с учётом ближайшего часа, выходные пусты", async () => {
    const s = await seedClinic(sql);
    const r = await availableSlots(sql, clock, { serviceId: s.consultId, doctorId: s.doctorId, fromDay: "2026-09-14", days: 7 });
    expect(counts(r)).toEqual({
      "2026-09-14": 18, "2026-09-15": 30, "2026-09-16": 30, "2026-09-17": 30,
      "2026-09-18": 30, "2026-09-19": 0, "2026-09-20": 0,
    });
    expect(r[0]!.slots[0]!.startsAt.toISOString()).toBe(localTime("2026-09-14", 720).toISOString());
  });

  it("занятость одного дня не трогает другой", async () => {
    const s = await seedClinic(sql);
    await holdSlot(sql, clock, { serviceId: s.consultId, doctorId: s.doctorId, startsAt: localTime("2026-09-15", 600), patient, consentIds: s.consentIds });
    const r = await availableSlots(sql, clock, { serviceId: s.consultId, doctorId: s.doctorId, fromDay: "2026-09-15", days: 2 });
    expect(counts(r)).toEqual({ "2026-09-15": 27, "2026-09-16": 30 });
  });

  it("исключение off снимает только свой день", async () => {
    const s = await seedClinic(sql);
    await sql`insert into schedule_exceptions (resource_id, day, kind) values (${s.doctorId}, '2026-09-16', 'off')`;
    const r = await availableSlots(sql, clock, { serviceId: s.consultId, doctorId: s.doctorId, fromDay: "2026-09-15", days: 3 });
    expect(counts(r)).toEqual({ "2026-09-15": 30, "2026-09-16": 0, "2026-09-17": 30 });
  });

  it("занятый аппарат уменьшает окна УЗИ, но не консультации", async () => {
    const s = await seedClinic(sql);
    const [doc2] = await sql<{ id: number }[]>`insert into resources (kind, title, specialty) values ('doctor', 'Петров П. П.', 'эндокринолог') returning id`;
    await sql`insert into service_resources (service_id, resource_id) values (${s.uziId}, ${doc2!.id})`;
    for (const wd of [1, 2, 3, 4, 5]) await sql`insert into schedule_rules (resource_id, weekday, from_min, to_min) values (${doc2!.id}, ${wd}, 540, 1080)`;
    await holdSlot(sql, clock, { serviceId: s.uziId, doctorId: doc2!.id, startsAt: localTime("2026-09-15", 600), patient, consentIds: s.consentIds });
    const uzi = await availableSlots(sql, clock, { serviceId: s.uziId, doctorId: s.doctorId, fromDay: "2026-09-15", days: 1 });
    const consult = await availableSlots(sql, clock, { serviceId: s.consultId, doctorId: s.doctorId, fromDay: "2026-09-15", days: 1 });
    // УЗИ 45 минут: без занятости 28 окон; аппарат занят 10:00–10:45 — минус 5 (09:30, 09:45, 10:00, 10:15, 10:30).
    expect(counts(uzi)).toEqual({ "2026-09-15": 23 });
    expect(counts(consult)).toEqual({ "2026-09-15": 30 });
  });

  it("дни за горизонтом пусты", async () => {
    const s = await seedClinic(sql);
    const r = await availableSlots(sql, clock, { serviceId: s.consultId, doctorId: s.doctorId, fromDay: "2026-10-13", days: 3 });
    expect(counts(r)).toEqual({ "2026-10-13": 30, "2026-10-14": 30, "2026-10-15": 0 });
  });
});
