import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { testDb, truncateAll, seedClinic } from "./helpers";
import type { Sql } from "@/lib/db/client";
import { holdSlot } from "@/lib/usecases/hold";
import { UsecaseError } from "@/lib/usecases/errors";
import { localTime } from "@/domain/time";

let sql: Sql;
beforeAll(() => { sql = testDb(); });
afterAll(async () => { await sql.end(); });
beforeEach(async () => { await truncateAll(sql); });

const clock = { now: () => new Date("2026-09-14T06:00:00Z") }; // пн, 11:00 местного
const DAY = "2026-09-15"; // вт
const patient = { fullName: "Иванов Иван Иванович", birthDate: "1980-01-01", phone: "+79000000001", email: "ivanov@example.com" };

describe("holdSlot", () => {
  it("создаёт удержание, занимает врача и аппарат, пишет согласия", async () => {
    const s = await seedClinic(sql);
    const r = await holdSlot(sql, clock, { serviceId: s.uziId, doctorId: s.doctorId, startsAt: localTime(DAY, 600), patient, consentIds: s.consentIds });
    expect(r.token).toHaveLength(21);
    expect(r.prepayKopecks).toBe(40000);
    expect(r.endsAt.toISOString()).toBe(localTime(DAY, 645).toISOString());
    expect(r.holdUntil.toISOString()).toBe("2026-09-14T06:15:00.000Z");
    const res = await sql<{ resourceId: number }[]>`select resource_id from booking_resources where booking_id = ${r.bookingId} and active order by 1`;
    expect(res.map(x => x.resourceId)).toEqual([s.doctorId, s.deviceId]);
    const cons = await sql`select consent_id from booking_consents where booking_id = ${r.bookingId}`;
    expect(cons).toHaveLength(2);
    const [b] = await sql<{ status: string; service: { durationMin: number; prepayKopecks: number } }[]>`select status, service from bookings where id = ${r.bookingId}`;
    expect(b!.status).toBe("held");
    expect(b!.service.durationMin).toBe(45);
  });

  it("второй на то же время получает slot_taken", async () => {
    const s = await seedClinic(sql);
    const input = { serviceId: s.consultId, doctorId: s.doctorId, startsAt: localTime(DAY, 600), patient, consentIds: s.consentIds };
    await holdSlot(sql, clock, input);
    const other = { ...input, patient: { ...patient, phone: "+79000000002" } };
    await expect(holdSlot(sql, clock, other)).rejects.toMatchObject({ code: "slot_taken" });
  });

  it("аппарат, занятый другой услугой, блокирует УЗИ, но не консультацию", async () => {
    const s = await seedClinic(sql);
    const [doc2] = await sql<{ id: number }[]>`insert into resources (kind, title, specialty) values ('doctor', 'Петров П. П.', 'эндокринолог') returning id`;
    await sql`insert into service_resources (service_id, resource_id) values (${s.uziId}, ${doc2!.id}), (${s.consultId}, ${doc2!.id})`;
    await holdSlot(sql, clock, { serviceId: s.uziId, doctorId: s.doctorId, startsAt: localTime(DAY, 600), patient, consentIds: s.consentIds });
    const p2 = { ...patient, phone: "+79000000002" };
    await expect(holdSlot(sql, clock, { serviceId: s.uziId, doctorId: doc2!.id, startsAt: localTime(DAY, 615), patient: p2, consentIds: s.consentIds })).rejects.toMatchObject({ code: "slot_taken" });
    await expect(holdSlot(sql, clock, { serviceId: s.consultId, doctorId: doc2!.id, startsAt: localTime(DAY, 615), patient: p2, consentIds: s.consentIds })).resolves.toBeTruthy();
  });

  it("вне часов, в прошлом и за горизонтом — понятные коды", async () => {
    const s = await seedClinic(sql);
    const base = { serviceId: s.consultId, doctorId: s.doctorId, patient, consentIds: s.consentIds };
    await expect(holdSlot(sql, clock, { ...base, startsAt: localTime(DAY, 480) })).rejects.toMatchObject({ code: "slot_closed" });
    await expect(holdSlot(sql, clock, { ...base, startsAt: localTime("2026-09-14", 660) })).rejects.toMatchObject({ code: "slot_past" });
    await expect(holdSlot(sql, clock, { ...base, startsAt: localTime("2026-11-10", 600) })).rejects.toMatchObject({ code: "beyond_horizon" });
  });

  it("врач, не оказывающий услугу, — doctor_mismatch; без согласий — consent_missing", async () => {
    const s = await seedClinic(sql);
    await expect(holdSlot(sql, clock, { serviceId: s.consultId, doctorId: s.deviceId, startsAt: localTime(DAY, 600), patient, consentIds: s.consentIds })).rejects.toMatchObject({ code: "doctor_mismatch" });
    await expect(holdSlot(sql, clock, { serviceId: s.consultId, doctorId: s.doctorId, startsAt: localTime(DAY, 600), patient, consentIds: [s.consentIds[0]] })).rejects.toMatchObject({ code: "consent_missing" });
  });

  it("один пациент не может держать две записи на пересекающееся время", async () => {
    const s = await seedClinic(sql);
    const [doc2] = await sql<{ id: number }[]>`insert into resources (kind, title, specialty) values ('doctor', 'Петров П. П.', 'терапевт') returning id`;
    await sql`insert into service_resources (service_id, resource_id) values (${s.consultId}, ${doc2!.id})`;
    await holdSlot(sql, clock, { serviceId: s.consultId, doctorId: s.doctorId, startsAt: localTime(DAY, 600), patient, consentIds: s.consentIds });
    await expect(holdSlot(sql, clock, { serviceId: s.consultId, doctorId: doc2!.id, startsAt: localTime(DAY, 615), patient, consentIds: s.consentIds })).rejects.toMatchObject({ code: "duplicate_booking" });
  });

  it("повторный пациент по телефону и дате рождения не дублируется, имя и почта обновляются", async () => {
    const s = await seedClinic(sql);
    await holdSlot(sql, clock, { serviceId: s.consultId, doctorId: s.doctorId, startsAt: localTime(DAY, 600), patient, consentIds: s.consentIds });
    await holdSlot(sql, clock, { serviceId: s.consultId, doctorId: s.doctorId, startsAt: localTime(DAY, 900), patient: { ...patient, email: "new@example.com" }, consentIds: s.consentIds });
    const rows = await sql<{ email: string }[]>`select email from patients`;
    expect(rows).toEqual([{ email: "new@example.com" }]);
  });

  it("при паузе онлайн-записи сайт получает online_paused, администратор — нет", async () => {
    const s = await seedClinic(sql);
    await sql`update settings set online_booking_paused = true where id = 1`;
    const input = { serviceId: s.consultId, doctorId: s.doctorId, startsAt: localTime(DAY, 600), patient, consentIds: s.consentIds };
    await expect(holdSlot(sql, clock, input)).rejects.toMatchObject({ code: "online_paused" });
    await expect(holdSlot(sql, clock, { ...input, source: "admin" })).resolves.toBeTruthy();
  });

  it("UsecaseError — это Error с кодом", () => {
    const e = new UsecaseError("not_found", "нет");
    expect(e).toBeInstanceOf(Error);
    expect(e.code).toBe("not_found");
  });
});
