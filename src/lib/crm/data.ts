// Данные CRM регистратуры (дизайн v2, «Лотос v2 - CRM»): записи с журналом
// операций, колонки врачей на день, сверка оплат, лист на завтра, приём врача.
// Подписи и цвета — в lib/crm/labels.ts; здесь только выборки и расчёт.
import type { Db } from "@/lib/db/client";
import type { Clock } from "@/ports/clock";
import { type IsoDay, addDays, localDay, localMinutes, localTime, weekday } from "@/domain/time";
import type { BookingStatus } from "@/domain/transitions";
import { reminderAt } from "@/domain/reminder";
import { shortName } from "@/lib/format";

export type MoneyState = "none" | "advance" | "settled" | "retained" | "moved" | "refund_pending" | "refunded";
export type CrmOp = { at: Date; op: string; detail: string; amountKopecks: number; sign: "+" | "−" | "0" };
export type CrmBooking = {
  id: number; token: string; day: IsoDay; startMin: number; durMin: number; startsAt: Date;
  doctorId: number; doctorShort: string; serviceId: number; service: string; prepayKopecks: number;
  patient: string; patientFull: string; isChild: boolean; dob: string; phone: string;
  status: BookingStatus; source: "site" | "phone" | "desk" | "admin"; deadline: Date | null; claimNote: string | null;
  recorder: string | null; consentPending: boolean; money: MoneyState; refundMethod: "provider" | "cash" | "bank" | null;
  cancelledAt: Date | null; cancelledBy: "patient" | "clinic" | null; cancelReason: string | null; movedTo: { startsAt: Date; doctorShort: string } | null;
  reminder: { kind: "sent" | "queued" | "planned" | "none" | "not_site"; at: Date | null };
  ops: CrmOp[];
};
export type CrmDoctor = { id: number; short: string; full: string; spec: string; room: string | null };

const ru = (iso: string) => `${iso.slice(8, 10)}.${iso.slice(5, 7)}.${iso.slice(0, 4)}`;
const fmtPhone = (e164: string) => {
  const d = e164.replace(/\D/g, "");
  return d.length === 11 ? `+7 ${d.slice(1, 4)} ${d.slice(4, 7)}-${d.slice(7, 9)}-${d.slice(9, 11)}` : e164;
};
const CHANNEL: Record<string, string> = { online: "Онлайн", cash: "Наличные", manual: "Сверено вручную", transfer: "Перенос" };

export async function crmDoctors(sql: Db): Promise<CrmDoctor[]> {
  const rows = await sql<{ id: number; title: string; specialty: string | null; room: string | null }[]>`
    select id, title, specialty, room from resources where kind = 'doctor' and active order by id`;
  return rows.map(r => ({ id: r.id, full: r.title, short: shortName(r.title), spec: r.specialty ?? "", room: r.room }));
}

type Filter = { from?: IsoDay; to?: IsoDay; ids?: number[]; doctorId?: number; q?: string; statuses?: BookingStatus[]; limit?: number };

/** Записи с деньгами и журналом. Удержания без телефона (оплата на сайте ещё не начата) не показываем. */
export async function crmBookings(sql: Db, clock: Clock, f: Filter): Promise<CrmBooking[]> {
  const now = clock.now();
  const q = f.q?.trim().toLowerCase() ?? "";
  const digits = q.replace(/\D/g, "");
  const rows = await sql<{
    id: number; token: string; startsAt: Date; endsAt: Date; resourceId: number; resourceTitle: string; resourceKind: string; serviceId: number;
    service: { title: string; prepayKopecks: number }; patient: string; birthDate: string; patientPhone: string;
    status: BookingStatus; source: CrmBooking["source"]; holdUntil: Date | null; payDeadline: Date | null; claimNote: string | null;
    bookerRelation: "self" | "child" | "relative"; bookerName: string | null; bookerPhone: string | null;
    patientConsentToken: string | null; patientConsentAt: Date | null; createdAt: Date;
    cancelledAt: Date | null; cancelledBy: "patient" | "clinic" | null; cancelReason: string | null;
  }[]>`
    select b.id, b.token, b.starts_at, b.ends_at, b.resource_id, r.title as resource_title, r.kind as resource_kind, b.service_id, b.service,
      p.full_name as patient, to_char(p.birth_date, 'YYYY-MM-DD') as birth_date, p.phone as patient_phone,
      b.status, b.source, b.hold_until, b.pay_deadline, b.claim_note, b.booker_relation, b.booker_name, b.booker_phone,
      b.patient_consent_token, b.patient_consent_at, b.created_at, b.cancelled_at, b.cancelled_by, b.cancel_reason
    from bookings b join patients p on p.id = b.patient_id join resources r on r.id = b.resource_id
    where b.status <> 'expired' and not (b.status = 'held' and b.phone_verified_at is null and b.source = 'site')
      ${f.ids ? sql`and b.id in ${sql(f.ids.length ? f.ids : [0])}` : sql``}
      ${f.from ? sql`and b.starts_at >= ${localTime(f.from, 0)}` : sql``}
      ${f.to ? sql`and b.starts_at < ${localTime(addDays(f.to, 1), 0)}` : sql``}
      ${f.doctorId ? sql`and b.resource_id = ${f.doctorId}` : sql``}
      ${f.statuses ? sql`and b.status in ${sql(f.statuses)}` : sql``}
      ${q ? sql`and (lower(p.full_name) like ${"%" + q + "%"} ${digits.length >= 3 ? sql`or p.phone like ${"%" + digits + "%"} or b.booker_phone like ${"%" + digits + "%"}` : sql``} ${/^\d+$/.test(q) ? sql`or b.id::text = ${q}` : sql``})` : sql``}
    order by b.starts_at, b.id
    limit ${f.limit ?? 500}`;
  if (rows.length === 0) return [];
  const ids = rows.map(r => r.id);

  const ledger = await sql<{ bookingId: number; kind: string; amountKopecks: number; channel: string | null; detail: string | null; note: string | null; createdAt: Date }[]>`
    select booking_id, kind, amount_kopecks, channel, detail, note, created_at from ledger where booking_id in ${sql(ids)} order by created_at, id`;
  const refunds = await sql<{ bookingId: number; amountKopecks: number; status: string; method: "provider" | "cash" | "bank"; createdAt: Date }[]>`
    select booking_id, amount_kopecks, status, method, created_at from refunds where booking_id in ${sql(ids)} and status <> 'done'`;
  const moved = await sql<{ fromId: number; startsAt: Date; title: string }[]>`
    select b.transferred_from_id as from_id, b.starts_at, r.title from bookings b join resources r on r.id = b.resource_id
    where b.transferred_from_id in ${sql(ids)}`;
  const reminders = await sql<{ bookingId: number; status: string; sentAt: Date | null; createdAt: Date }[]>`
    select booking_id, status, sent_at, created_at from notifications where booking_id in ${sql(ids)} and template = 'booking_reminder'`;

  return rows.map(b => {
    const led = ledger.filter(l => l.bookingId === b.id);
    const ref = refunds.filter(r => r.bookingId === b.id);
    const mv = moved.find(m => m.fromId === b.id);
    const has = (k: string) => led.some(l => l.kind === k);
    const money: MoneyState = has("transfer_out") ? "moved" : ref.length ? "refund_pending" : has("refund") ? "refunded"
      : has("settle") ? "settled" : has("retain") ? "retained" : has("advance") || has("transfer_in") ? "advance" : "none";

    const ops: CrmOp[] = led.map(l => {
      const ch = l.channel ? CHANNEL[l.channel] ?? l.channel : "";
      switch (l.kind) {
        case "advance": return { at: l.createdAt, op: "Аванс получен", detail: l.detail ?? `${ch} · чек аванса`, amountKopecks: l.amountKopecks, sign: "+" as const };
        case "settle": return { at: l.createdAt, op: "Зачёт аванса", detail: "чек при оказании услуги", amountKopecks: 0, sign: "0" as const };
        case "retain": return { at: l.createdAt, op: "Удержание", detail: l.note ?? l.detail ?? "неявка", amountKopecks: 0, sign: "0" as const };
        case "refund": return { at: l.createdAt, op: "Возврат выполнен", detail: `${l.detail ?? "на карту"} · чек возврата`, amountKopecks: l.amountKopecks, sign: "−" as const };
        case "transfer_out": return { at: l.createdAt, op: "Аванс перенесён", detail: l.detail ?? "на новую запись", amountKopecks: 0, sign: "0" as const };
        case "transfer_in": return { at: l.createdAt, op: "Аванс с прежней записи", detail: l.detail ?? "перенос", amountKopecks: 0, sign: "0" as const };
        default: return { at: l.createdAt, op: l.kind, detail: l.detail ?? "", amountKopecks: l.amountKopecks, sign: "0" as const };
      }
    });
    for (const r of ref) ops.push({ at: r.createdAt, op: "Возврат инициирован", detail: `${b.cancelledBy === "clinic" ? "Клиника" : "Пациент"} отменил${b.cancelledBy === "clinic" ? "а" : ""} запись${b.cancelReason ? ` · ${b.cancelReason}` : ""}`, amountKopecks: r.amountKopecks, sign: "−" });
    if (b.status === "cancelled" && money === "none" && b.cancelledAt) ops.push({ at: b.cancelledAt, op: "Отмена", detail: b.cancelReason ?? "без денег", amountKopecks: 0, sign: "0" });
    if (b.status === "transferred" && money === "none" && mv) ops.push({ at: b.cancelledAt ?? b.createdAt, op: "Перенос", detail: "без денег", amountKopecks: 0, sign: "0" });
    ops.sort((x, y) => x.at.getTime() - y.at.getTime());

    const rem = reminders.find(r => r.bookingId === b.id);
    const plan = b.source === "site" ? reminderAt({ now: b.createdAt, startsAt: b.startsAt }) : null;
    const reminder: CrmBooking["reminder"] = b.source !== "site" ? { kind: "not_site", at: null }
      : rem ? (rem.status === "sent" ? { kind: "sent", at: rem.sentAt } : { kind: "queued", at: rem.createdAt })
      : plan && plan > now ? { kind: "planned", at: plan } : { kind: "none", at: null };

    const isChild = b.bookerRelation === "child";
    const phone = b.bookerPhone ?? b.patientPhone;
    return {
      id: b.id, token: b.token, day: localDay(b.startsAt), startMin: localMinutes(b.startsAt), durMin: Math.round((b.endsAt.getTime() - b.startsAt.getTime()) / 60000),
      startsAt: b.startsAt, doctorId: b.resourceId, doctorShort: b.resourceKind === "doctor" ? shortName(b.resourceTitle) : b.resourceTitle, serviceId: b.serviceId, service: b.service.title,
      prepayKopecks: b.service.prepayKopecks, patient: `${b.patient}${isChild ? " (ребёнок)" : ""}`, patientFull: b.patient, isChild,
      dob: ru(b.birthDate), phone: fmtPhone(phone), status: b.status, source: b.source,
      deadline: b.status === "held" ? b.holdUntil : b.payDeadline, claimNote: b.claimNote,
      recorder: isChild ? b.bookerName : b.bookerRelation === "relative" ? `родственник или знакомый · ${fmtPhone(b.bookerPhone ?? "")}` : null,
      consentPending: b.patientConsentToken != null && b.patientConsentAt == null, money, refundMethod: ref[0]?.method ?? null,
      cancelledAt: b.cancelledAt, cancelledBy: b.cancelledBy, cancelReason: b.cancelReason,
      movedTo: mv ? { startsAt: mv.startsAt, doctorShort: shortName(mv.title) } : null, reminder, ops,
    };
  });
}

export type CrmColumn = CrmDoctor & {
  off: string | null; group: { have: number; min: number; decideAt: Date } | null;
  quota: { fromMin: number; toMin: number }[]; bookings: CrmBooking[];
};

/** Колонки расписания на день: врачи с приёмом в этот день или с записями на него. */
export async function crmDay(sql: Db, clock: Clock, day: IsoDay): Promise<CrmColumn[]> {
  const doctors = await crmDoctors(sql);
  const bookings = (await crmBookings(sql, clock, { from: day, to: day })).filter(b => !["cancelled", "transferred"].includes(b.status));
  const rules = await sql<{ resourceId: number }[]>`select distinct resource_id from schedule_rules where weekday = ${weekday(day)}`;
  const offs = await sql<{ resourceId: number; reason: string | null }[]>`select resource_id, reason from schedule_exceptions
    where day = ${day} and kind = 'off' and from_min is null`;
  const groups = await sql<{ resourceId: number; minPatients: number; decideAt: Date }[]>`select resource_id, min_patients, decide_at from group_days where day = ${day}`;
  const quota = await sql<{ resourceId: number; fromMin: number; toMin: number }[]>`select resource_id, from_min, to_min from site_quota where weekday = ${weekday(day)} order by from_min`;
  const works = new Set(rules.map(r => r.resourceId));
  return doctors
    .filter(d => works.has(d.id) || bookings.some(b => b.doctorId === d.id) || offs.some(o => o.resourceId === d.id))
    .map(d => {
      const off = offs.find(o => o.resourceId === d.id);
      const mine = bookings.filter(b => b.doctorId === d.id);
      const g = groups.find(x => x.resourceId === d.id);
      // Квота сайта — только свободная её часть: занятые записями куски вырезаем.
      const busy = mine.map(b => [b.startMin, b.startMin + b.durMin] as const);
      const free = quota.filter(x => x.resourceId === d.id).flatMap(x => cut([x.fromMin, x.toMin], busy)).map(([fromMin, toMin]) => ({ fromMin, toMin }));
      return { ...d, off: off ? off.reason ?? "без причины" : null, bookings: off ? [] : mine, quota: off ? [] : free,
        group: g ? { have: mine.length, min: g.minPatients, decideAt: g.decideAt } : null };
    });
}

function cut(range: readonly [number, number], busy: readonly (readonly [number, number])[]): [number, number][] {
  let parts: [number, number][] = [[range[0], range[1]]];
  for (const [bs, be] of busy) {
    parts = parts.flatMap(([s, e]) => (be <= s || bs >= e ? [[s, e] as [number, number]] : [...(bs > s ? [[s, bs] as [number, number]] : []), ...(be < e ? [[be, e] as [number, number]] : [])]));
  }
  return parts.filter(([s, e]) => e - s >= 5);
}

export type Incoming = { id: number; receivedAt: Date; amountKopecks: number; text: string; source: string };

export async function reconData(sql: Db, clock: Clock): Promise<{ incoming: Incoming[]; waiting: CrmBooking[] }> {
  const incoming = await sql<Incoming[]>`select id, received_at, amount_kopecks, text, source from bank_incoming
    where matched_booking_id is null order by received_at`;
  const waiting = await crmBookings(sql, clock, { statuses: ["claimed", "pending"], from: localDay(clock.now()) });
  waiting.sort((a, b) => Number(b.status === "claimed") - Number(a.status === "claimed") || a.startsAt.getTime() - b.startsAt.getTime());
  return { incoming, waiting };
}

/** Лист на день для печати: по врачам, без снятых приёмов, отменённых и перенесённых. */
export async function printData(sql: Db, clock: Clock, day: IsoDay): Promise<{ doctor: CrmDoctor; rows: CrmBooking[] }[]> {
  const cols = await crmDay(sql, clock, day);
  return cols.filter(c => !c.off && c.bookings.length).map(c => ({ doctor: c, rows: c.bookings }));
}

/** «Мой приём» врача: сегодня и следующий рабочий день. */
export async function doctorDays(sql: Db, clock: Clock, resourceId: number): Promise<{ day: IsoDay; off: string | null; rows: CrmBooking[] }[]> {
  const today = localDay(clock.now());
  const days = [today, addDays(today, 1)];
  const offs = await sql<{ day: string; reason: string | null }[]>`select to_char(day, 'YYYY-MM-DD') as day, reason from schedule_exceptions
    where resource_id = ${resourceId} and kind = 'off' and from_min is null and day in ${sql(days)}`;
  const all = (await crmBookings(sql, clock, { from: days[0], to: days[1], doctorId: resourceId })).filter(b => !["cancelled", "transferred"].includes(b.status));
  return days.map(day => {
    const off = offs.find(o => o.day === day);
    return { day, off: off ? off.reason ?? "" : null, rows: off ? [] : all.filter(b => b.day === day) };
  });
}
