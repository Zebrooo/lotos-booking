// Действия регистратуры в CRM. Каждое проверяет статус записи и роль
// сотрудника в базе, пишет строку аудита (кто и что сделал) и возвращает
// понятную ошибку вместо исключения — её покажет интерфейс.
import type { Sql, Db } from "@/lib/db/client";
import type { Clock } from "@/ports/clock";
import { type IsoDay, localDay, localTime } from "@/domain/time";
import { transition, type BookingStatus } from "@/domain/transitions";
import { canAppend, type LedgerRow } from "@/domain/money";
import { dateNum, hhmmOf, wdShort, shortName } from "@/lib/format";
import { cancelBooking } from "@/lib/usecases/cancel";
import { transferBooking } from "@/lib/usecases/transfer";
import { markDone, markNoShow } from "@/lib/usecases/outcome";
import { queueReceipt, queueSms } from "@/lib/usecases/contact";
import { UsecaseError } from "@/lib/usecases/errors";
import { doctorCalendar } from "@/lib/queries/doctor-calendar";
import type { StaffRole } from "@/lib/staff/auth";

type Result = { ok: true } | { ok: false; error: string };
const CLOSED = "Запись уже оплачена или закрыта";

async function audit(tx: Db, adminId: number, action: string, bookingId: number | null, details: Record<string, unknown> = {}) {
  await tx`insert into audit (admin_id, action, booking_id, details) values (${adminId}, ${action}, ${bookingId}, ${tx.json(details as never)})`;
}
async function staffRow(tx: Db, adminId: number) {
  const [a] = await tx<{ role: StaffRole; fullName: string | null; resourceId: number | null }[]>`select role, full_name, resource_id from admins where id = ${adminId} and active`;
  return a ?? null;
}
type Locked = { id: number; status: BookingStatus; startsAt: Date; source: string; service: { title: string; prepayKopecks: number } };
async function lock(tx: Db, bookingId: number): Promise<Locked | null> {
  const [b] = await tx<Locked[]>`select id, status, starts_at, source, service from bookings where id = ${bookingId} for update`;
  return b ?? null;
}
const errText = (e: unknown, fallback: string) => {
  if (e instanceof UsecaseError) {
    if (e.code === "slot_taken") return "Это время только что заняли — выберите другое";
    if (e.code === "bad_status") return CLOSED;
    return fallback;
  }
  throw e;
};

/** Аванс, внесённый на стойке или по сверке: ledger, чек аванса, подтверждение записи. */
async function acceptAdvance(tx: Db, b: Locked, now: Date, channel: "cash" | "manual", detail: string) {
  const rows = await tx<LedgerRow[]>`select kind, amount_kopecks from ledger where booking_id = ${b.id} order by id`;
  const ok = canAppend(rows, { kind: "advance", amountKopecks: b.service.prepayKopecks });
  if (!ok.ok) throw new Error(`журнал записи ${b.id}: ${ok.reason}`);
  const [l] = await tx<{ id: number }[]>`insert into ledger (booking_id, kind, amount_kopecks, channel, detail)
    values (${b.id}, 'advance', ${b.service.prepayKopecks}, ${channel}, ${detail}) returning id`;
  await queueReceipt(tx, { bookingId: b.id, kind: "advance", ledgerId: l!.id, amountKopecks: b.service.prepayKopecks });
  await tx`update bookings set status = 'confirmed', paid_at = ${now}, hold_until = null where id = ${b.id}`;
  // Записавшимся на сайте — СМС; записанным по телефону и на стойке СМС не шлём (дизайн v2).
  if (b.source === "site") await queueSms(tx, b.id, "booking_confirmed");
}

export async function recordCash(sql: Sql, clock: Clock, input: { bookingId: number; adminId: number }): Promise<Result> {
  const now = clock.now();
  return sql.begin(async tx => {
    const b = await lock(tx, input.bookingId);
    if (!b || !transition(b.status, "pay", "clinic").ok) return { ok: false as const, error: CLOSED };
    await acceptAdvance(tx, b, now, "cash", "Наличные · касса · чек аванса");
    await audit(tx, input.adminId, "cash_advance", b.id);
    return { ok: true as const };
  });
}

export async function reconcile(sql: Sql, clock: Clock, input: { incomingId: number; bookingId: number; adminId: number }): Promise<Result> {
  const now = clock.now();
  return sql.begin(async tx => {
    const [inc] = await tx<{ id: number; amountKopecks: number; text: string; matchedBookingId: number | null }[]>`
      select id, amount_kopecks, text, matched_booking_id from bank_incoming where id = ${input.incomingId} for update`;
    if (!inc) return { ok: false as const, error: "Поступление не найдено" };
    if (inc.matchedBookingId) return { ok: false as const, error: "Поступление уже сопоставлено" };
    const b = await lock(tx, input.bookingId);
    if (!b || !transition(b.status, "pay", "clinic").ok) return { ok: false as const, error: CLOSED };
    if (inc.amountKopecks !== b.service.prepayKopecks) return { ok: false as const, error: "Сумма поступления не совпадает с предоплатой" };
    await acceptAdvance(tx, b, now, "manual", `Сверено вручную с «${inc.text.slice(0, 28)}…» · чек аванса`);
    await tx`update bank_incoming set matched_booking_id = ${b.id}, matched_at = ${now}, matched_by = ${input.adminId} where id = ${inc.id}`;
    await audit(tx, input.adminId, "reconcile", b.id, { incomingId: inc.id });
    return { ok: true as const };
  });
}

export async function markArrived(sql: Sql, clock: Clock, input: { bookingId: number; adminId: number }): Promise<Result> {
  const now = clock.now();
  return sql.begin(async tx => {
    const b = await lock(tx, input.bookingId);
    if (!b || !transition(b.status, "arrive", "clinic").ok) return { ok: false as const, error: "Отметить приход можно только у подтверждённой записи" };
    if (localDay(b.startsAt) !== localDay(now)) return { ok: false as const, error: "Отметить приход можно только в день приёма" };
    await tx`update bookings set status = 'arrived', arrived_at = ${now} where id = ${b.id}`;
    await audit(tx, input.adminId, "arrived", b.id);
    return { ok: true as const };
  });
}

export async function staffDone(sql: Sql, clock: Clock, input: { bookingId: number; adminId: number }): Promise<Result> {
  try {
    await markDone(sql, clock, input.bookingId);
  } catch (e) {
    return { ok: false, error: errText(e, CLOSED) };
  }
  await audit(sql, input.adminId, "done", input.bookingId);
  return { ok: true };
}

export async function staffNoShow(sql: Sql, clock: Clock, input: { bookingId: number; adminId: number }): Promise<Result> {
  const [b] = await sql<{ startsAt: Date }[]>`select starts_at from bookings where id = ${input.bookingId}`;
  if (!b) return { ok: false, error: CLOSED };
  if (localDay(b.startsAt) > localDay(clock.now())) return { ok: false, error: "Неявку отмечают в день приёма" };
  try {
    await markNoShow(sql, clock, input.bookingId);
  } catch (e) {
    return { ok: false, error: errText(e, CLOSED) };
  }
  await audit(sql, input.adminId, "no_show", input.bookingId);
  return { ok: true };
}

export async function staffCancel(sql: Sql, clock: Clock, input: { bookingId: number; initiator: "patient" | "clinic"; adminId: number; reason?: string }): Promise<{ ok: true; refund: boolean } | { ok: false; error: string }> {
  const reason = input.reason ?? (input.initiator === "patient" ? "По просьбе пациента" : "По инициативе клиники");
  try {
    const r = await cancelBooking(sql, clock, { bookingId: input.bookingId, actor: input.initiator, reason });
    await audit(sql, input.adminId, "cancel", input.bookingId, { initiator: input.initiator, reason });
    return { ok: true, refund: r.refundId != null };
  } catch (e) {
    return { ok: false, error: errText(e, CLOSED) };
  }
}

export async function staffMove(sql: Sql, clock: Clock, input: { bookingId: number; startsAt: Date; adminId: number; doctorId?: number }): Promise<{ ok: true; newBookingId: number } | { ok: false; error: string }> {
  const [b] = await sql<{ resourceId: number }[]>`select resource_id from bookings where id = ${input.bookingId}`;
  if (!b) return { ok: false, error: CLOSED };
  try {
    const r = await transferBooking(sql, clock, { bookingId: input.bookingId, actor: "clinic", doctorId: input.doctorId ?? b.resourceId, startsAt: input.startsAt });
    await audit(sql, input.adminId, "move", input.bookingId, { newBookingId: r.newBookingId, startsAt: input.startsAt.toISOString() });
    return { ok: true, newBookingId: r.newBookingId };
  } catch (e) {
    return { ok: false, error: errText(e, "Перенести на это время нельзя") };
  }
}

/** Возврат наличными или переводом выдан: ledger, чек возврата. */
export async function giveManualRefund(sql: Sql, clock: Clock, input: { bookingId: number; adminId: number }): Promise<Result> {
  const now = clock.now();
  return sql.begin(async tx => {
    const [r] = await tx<{ id: number; amountKopecks: number; method: "cash" | "bank" }[]>`select id, amount_kopecks, method from refunds
      where booking_id = ${input.bookingId} and method in ('cash', 'bank') and status <> 'done' for update`;
    if (!r) return { ok: false as const, error: "Возврат не ожидается" };
    const rows = await tx<LedgerRow[]>`select kind, amount_kopecks from ledger where booking_id = ${input.bookingId} order by id`;
    const ok = canAppend(rows, { kind: "refund", amountKopecks: r.amountKopecks });
    if (!ok.ok) throw new Error(`журнал записи ${input.bookingId}: ${ok.reason}`);
    const [l] = await tx<{ id: number }[]>`insert into ledger (booking_id, kind, amount_kopecks, channel, detail, created_at)
      values (${input.bookingId}, 'refund', ${r.amountKopecks}, ${r.method === "cash" ? "cash" : "manual"}, ${r.method === "cash" ? "наличными в регистратуре" : "переводом"}, ${now}) returning id`;
    await queueReceipt(tx, { bookingId: input.bookingId, kind: "refund", ledgerId: l!.id, amountKopecks: r.amountKopecks });
    await tx`update refunds set status = 'done', done_by = ${input.adminId}, attempts = attempts + 1 where id = ${r.id}`;
    await audit(tx, input.adminId, "manual_refund", input.bookingId, { method: r.method });
    return { ok: true as const };
  });
}

export async function pauseOnline(sql: Sql, clock: Clock, input: { adminId: number; reason: string; comment: string }): Promise<Result> {
  const a = await staffRow(sql, input.adminId);
  if (a?.role !== "senior") return { ok: false, error: "Приостановить онлайн-запись может только старший смены" };
  await sql`update settings set online_booking_paused = true, paused_at = ${clock.now()}, paused_by = ${a.fullName ?? ""},
    paused_reason = ${input.reason.slice(0, 120)}, paused_comment = ${input.comment.trim().slice(0, 300) || null} where id = 1`;
  await audit(sql, input.adminId, "pause", null, { reason: input.reason, comment: input.comment });
  return { ok: true };
}

export async function resumeOnline(sql: Sql, clock: Clock, input: { adminId: number }): Promise<Result> {
  void clock;
  const a = await staffRow(sql, input.adminId);
  if (a?.role !== "senior") return { ok: false, error: "Возобновить онлайн-запись может только старший смены" };
  await sql`update settings set online_booking_paused = false, paused_at = null, paused_by = null, paused_reason = null, paused_comment = null where id = 1`;
  await audit(sql, input.adminId, "resume", null);
  return { ok: true };
}

export function requestReason(text: string): "Болезнь" | "Не набрали пациентов" | "Другое" {
  return /набр/i.test(text) ? "Не набрали пациентов" : /бол/i.test(text) || !text.trim() ? "Болезнь" : "Другое";
}

export async function requestDayOff(sql: Sql, clock: Clock, input: { adminId: number; day: IsoDay; text: string }): Promise<Result> {
  const a = await staffRow(sql, input.adminId);
  if (a?.role !== "doctor" || !a.resourceId) return { ok: false, error: "Запрос отправляет врач из своего кабинета" };
  if (input.day < localDay(clock.now())) return { ok: false, error: "Этот день уже прошёл" };
  const [r] = await sql<{ title: string }[]>`select title from resources where id = ${a.resourceId}`;
  const text = input.text.trim().slice(0, 300) || "болезнь";
  await sql`insert into doctor_requests (resource_id, day, reason, text, created_by, created_at)
    values (${a.resourceId}, ${input.day}, ${requestReason(text)}, ${`${shortName(r!.title)} просит снять приём ${dateNum(input.day)}: ${text}`}, ${input.adminId}, ${clock.now()})`;
  return { ok: true };
}

export type MoveOption = { startsAt: Date; label: string };

/** Ближайшие свободные окна того же врача и услуги — для переноса регистратурой. */
export async function moveOptions(sql: Sql, clock: Clock, input: { bookingId: number; count: number; avoidDay?: IsoDay }): Promise<MoveOption[]> {
  const [b] = await sql<{ resourceId: number; serviceId: number; startsAt: Date }[]>`select resource_id, service_id, starts_at from bookings where id = ${input.bookingId}`;
  if (!b) return [];
  const cal = await doctorCalendar(sql, clock, { doctorId: b.resourceId, serviceId: b.serviceId });
  const out: MoveOption[] = [];
  for (const d of cal.days) {
    if (d.off || d.day === input.avoidDay) continue;
    for (const [min, taken] of d.slots) {
      if (taken) continue;
      const at = localTime(d.day, min);
      if (at.getTime() === b.startsAt.getTime()) continue;
      out.push({ startsAt: at, label: `${wdShort(d.day)}, ${d.day.slice(8, 10)}.${d.day.slice(5, 7)} · ${hhmmOf(at)}` });
      if (out.length >= input.count) return out;
    }
  }
  return out;
}

export type DayDecision = { bookingId: number; kind: "refund" | "move"; startsAt?: Date; called: boolean };

/**
 * Снятие приёма врача на день: по каждой живой записи — возврат (или отмена
 * без денег) либо перенос; каждому пациенту позвонили. Потом день закрывается
 * исключением в расписании, запрос врача на этот день считается разобранным.
 */
export async function closeDoctorDay(sql: Sql, clock: Clock, input: { adminId: number; doctorId: number; day: IsoDay; reason: string; decisions: DayDecision[] }): Promise<Result> {
  const a = await staffRow(sql, input.adminId);
  if (!a || a.role === "doctor") return { ok: false, error: "Снять приём может только администратор" };
  if (!input.reason.trim()) return { ok: false, error: "Выберите причину" };
  const live = await sql<{ id: number }[]>`select id from bookings where resource_id = ${input.doctorId}
    and status in ('held', 'pending', 'claimed', 'confirmed')
    and starts_at >= ${localTime(input.day, 0)} and starts_at < ${localTime(input.day, 1440)}`;
  const by = new Map(input.decisions.map(d => [d.bookingId, d]));
  if (live.some(l => !by.has(l.id))) return { ok: false, error: "Решение нужно по каждой записи" };
  if (input.decisions.some(d => !d.called)) return { ok: false, error: "Отметьте звонок каждому пациенту" };
  if (input.decisions.some(d => d.kind === "move" && !d.startsAt)) return { ok: false, error: "Выберите новое время для переноса" };
  for (const d of input.decisions) {
    if (!live.some(l => l.id === d.bookingId)) continue;
    const r = d.kind === "move"
      ? await staffMove(sql, clock, { bookingId: d.bookingId, startsAt: d.startsAt!, adminId: input.adminId })
      : await staffCancel(sql, clock, { bookingId: d.bookingId, initiator: "clinic", adminId: input.adminId, reason: `Клиника сняла приём · ${input.reason}` });
    if (!r.ok) return { ok: false, error: r.error };
  }
  await sql.begin(async tx => {
    await tx`insert into schedule_exceptions (resource_id, day, kind, reason) values (${input.doctorId}, ${input.day}, 'off', ${input.reason})`;
    await tx`update doctor_requests set handled_at = ${clock.now()} where resource_id = ${input.doctorId} and day = ${input.day} and handled_at is null`;
    await audit(tx, input.adminId, "day_off", null, { doctorId: input.doctorId, day: input.day, reason: input.reason });
  });
  return { ok: true };
}
