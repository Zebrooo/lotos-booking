// tests/db/helpers.ts
import { createDb, type Sql } from "@/lib/db/client";
export const TEST_URL = process.env.TEST_DATABASE_URL ?? "postgres://lotos:lotos@127.0.0.1:55432/lotos_test";
export function testDb(): Sql { return createDb(TEST_URL, 4); }

export async function truncateAll(sql: Sql): Promise<void> {
  await sql`truncate audit, notifications, receipts, refunds, ledger, payments, booking_consents,
    booking_resources, bookings, consents, patients, schedule_exceptions, schedule_rules,
    service_resources, resources, services, admins, group_days, site_quota, sms_codes,
    patient_accounts, patient_sessions, medical_documents, document_reads, cabinet_requests,
    doctor_requests, bank_incoming, staff_sessions restart identity cascade`;
  await sql`update settings set free_cancel_hours = 24, hold_minutes = 15, lead_minutes = 60,
    horizon_days = 30, cooling_off_minutes = 60, slot_step_min = 15, online_booking_paused = false,
    pay_model = 'both', reserve_deadline_min = 1020, reserve_min_lead_minutes = 60,
    reserve_before_visit_minutes = 120, desk_opens_min = 480, booking_open_until = null,
    paused_at = null, paused_by = null, paused_reason = null, paused_comment = null where id = 1`;
}

/** Кардиолог с приёмом пн–пт 09:00–13:00 и 14:00–18:00, аппарат УЗИ, две услуги, два согласия. */
export async function seedClinic(sql: Sql) {
  const [doctor] = await sql<{ id: number }[]>`insert into resources (kind, title, specialty) values ('doctor', 'Жаворонкова А. А.', 'кардиолог') returning id`;
  const [device] = await sql<{ id: number }[]>`insert into resources (kind, title) values ('device', 'Аппарат УЗИ') returning id`;
  const [consult] = await sql<{ id: number }[]>`insert into services (title, kind, duration_min, price_kopecks) values ('Консультация кардиолога', 'consultation', 30, 180000) returning id`;
  const [uzi] = await sql<{ id: number }[]>`insert into services (title, kind, duration_min, price_kopecks) values ('УЗИ сердца', 'ultrasound', 45, 250000) returning id`;
  await sql`insert into service_resources (service_id, resource_id) values (${consult!.id}, ${doctor!.id}), (${uzi!.id}, ${doctor!.id}), (${uzi!.id}, ${device!.id})`;
  for (const wd of [1, 2, 3, 4, 5]) {
    await sql`insert into schedule_rules (resource_id, weekday, from_min, to_min) values (${doctor!.id}, ${wd}, 540, 780), (${doctor!.id}, ${wd}, 840, 1080)`;
  }
  const [pd] = await sql<{ id: number }[]>`insert into consents (kind, version, body) values ('personal_data', 1, 'Согласие на обработку персональных данных, редакция 1') returning id`;
  const [pt] = await sql<{ id: number }[]>`insert into consents (kind, version, body) values ('prepay_terms', 1, 'Условия предоплаты, редакция 1') returning id`;
  return { doctorId: doctor!.id, deviceId: device!.id, consultId: consult!.id, uziId: uzi!.id, consentIds: [pd!.id, pt!.id] as [number, number] };
}
