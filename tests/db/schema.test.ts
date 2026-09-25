import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { testDb, truncateAll, seedClinic } from "./helpers";
import type { Sql } from "@/lib/db/client";

let sql: Sql;
beforeAll(() => { sql = testDb(); });
afterAll(async () => { await sql.end(); });
beforeEach(async () => { await truncateAll(sql); });

describe("схема", () => {
  it("все таблицы на месте", async () => {
    const rows = await sql<{ tableName: string }[]>`select table_name from information_schema.tables where table_schema = 'public' order by 1`;
    expect(rows.map(r => r.tableName)).toEqual([
      "admins", "audit", "bank_incoming", "booking_consents", "booking_resources", "bookings", "cabinet_requests",
      "consents", "doctor_requests", "document_reads", "group_days", "ledger", "medical_documents", "notifications",
      "patient_accounts", "patient_sessions", "patients", "payments", "receipts", "refunds", "resources",
      "schedule_exceptions", "schedule_rules", "schema_migrations", "service_resources", "services", "settings",
      "site_quota", "sms_codes", "staff_sessions",
    ]);
  });

  it("исключающее ограничение не даёт занять ресурс дважды", async () => {
    const { doctorId, consultId } = await seedClinic(sql);
    const [p] = await sql<{ id: number }[]>`insert into patients (full_name, birth_date, phone, email) values ('Иванов И. И.', '1980-01-01', '+79000000001', 'i@example.com') returning id`;
    const mk = async (token: string, from: string, to: string) => {
      const [b] = await sql<{ id: number }[]>`insert into bookings (token, patient_id, service_id, service, resource_id, starts_at, ends_at, status, hold_until)
        values (${token}, ${p!.id}, ${consultId}, '{}', ${doctorId}, ${from}, ${to}, 'held', now() + interval '15 minutes') returning id`;
      return b!.id;
    };
    const b1 = await mk("t1", "2026-09-15T04:00:00Z", "2026-09-15T04:30:00Z");
    await sql`insert into booking_resources (booking_id, resource_id, starts_at, ends_at) values (${b1}, ${doctorId}, '2026-09-15T04:00:00Z', '2026-09-15T04:30:00Z')`;
    const b2 = await mk("t2", "2026-09-15T04:15:00Z", "2026-09-15T04:45:00Z");
    await expect(
      sql`insert into booking_resources (booking_id, resource_id, starts_at, ends_at) values (${b2}, ${doctorId}, '2026-09-15T04:15:00Z', '2026-09-15T04:45:00Z')`,
    ).rejects.toMatchObject({ code: "23P01", constraint_name: "booking_resources_no_overlap" });
    // Стык интервалов — не пересечение; неактивная строка ресурс не держит.
    const b3 = await mk("t3", "2026-09-15T04:30:00Z", "2026-09-15T05:00:00Z");
    await sql`insert into booking_resources (booking_id, resource_id, starts_at, ends_at) values (${b3}, ${doctorId}, '2026-09-15T04:30:00Z', '2026-09-15T05:00:00Z')`;
    await sql`update booking_resources set active = false where booking_id = ${b1}`;
    const b4 = await mk("t4", "2026-09-15T04:00:00Z", "2026-09-15T04:30:00Z");
    await sql`insert into booking_resources (booking_id, resource_id, starts_at, ends_at) values (${b4}, ${doctorId}, '2026-09-15T04:00:00Z', '2026-09-15T04:30:00Z')`;
  });

  it("v2: бронь без срока оплаты и неизвестное состояние отвергаются", async () => {
    const { doctorId, consultId } = await seedClinic(sql);
    const [p] = await sql<{ id: number }[]>`insert into patients (full_name, birth_date, phone, email) values ('Иванов И. И.', '1980-01-01', '+79000000001', 'i@example.com') returning id`;
    const insert = (status: string, deadline: string | null) => sql`insert into bookings (token, patient_id, service_id, service, resource_id, starts_at, ends_at, status, pay_mode, pay_deadline)
      values (${"t-" + status}, ${p!.id}, ${consultId}, '{}', ${doctorId}, '2026-09-15T04:00:00Z', '2026-09-15T04:30:00Z', ${status}, 'reserve', ${deadline})`;
    await expect(insert("pending", null)).rejects.toMatchObject({ code: "23514" });
    await expect(insert("waiting", "2026-09-14T12:00:00Z")).rejects.toMatchObject({ code: "23514" });
    await insert("pending", "2026-09-14T12:00:00Z");
    const [s] = await sql<{ payMode: string }[]>`select pay_mode from bookings limit 1`;
    expect(s!.payMode).toBe("reserve");
  });
});
