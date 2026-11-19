import type { Db } from "@/lib/db/client";
import type { Clock } from "@/ports/clock";
import type { BookingServiceItem, BookingServiceSnapshot } from "@/domain/booking-service";
import { type IsoDay, addDays, localDay, localTime, localMinutes } from "@/domain/time";
import { freeSlots, type Rule, type ScheduleException, type Busy, type Slot } from "@/domain/slots";
import { UsecaseError } from "@/lib/usecases/errors";
import { loadSettings, slotSettings } from "@/lib/usecases/settings";
import { makeLabPoolSnapshot, MAX_LAB_SERVICES } from "@/lib/lab-pool";

export type LabPool = {
  items: BookingServiceItem[];
  resourceId: number;
  resourceTitle: string;
  resourceIds: number[];
  snapshot: BookingServiceSnapshot & { items: BookingServiceItem[] };
};
export type LabSlotContext = LabPool & { rules: Rule[]; exceptions: ScheduleException[]; busy: Busy[] };

export async function loadLabPool(sql: Db, requestedIds: number[]): Promise<LabPool> {
  const ids = [...new Set(requestedIds)].sort((a, b) => a - b);
  if (ids.length === 0 || ids.length > MAX_LAB_SERVICES || ids.some(id => !Number.isSafeInteger(id) || id <= 0)) {
    throw new UsecaseError("lab_pool_invalid", "выберите от 1 до 10 анализов");
  }
  const items = await sql<(BookingServiceItem & { id: number; active: boolean; bookableKind: boolean })[]>`
    select s.id, s.id as service_id, coalesce(p.code, '') as code, s.title, s.duration_min, s.price_kopecks,
      s.prepay_kopecks, s.prep_note, s.active,
      (p.kind in ('analysis', 'complex') or (l.external_id is null and s.kind = 'analysis')) as bookable_kind
    from services s
    left join service_price_links l on l.service_id = s.id
    left join external_price_products p on p.source = l.source and p.external_id = l.external_id
      and p.run_id = (select max(id) from price_import_runs where status = 'success')
    where s.id in ${sql(ids)} order by s.id`;
  if (items.length !== ids.length || items.some(item => !item.active || !item.bookableKind)) {
    throw new UsecaseError("lab_pool_invalid", "в выборе есть недоступная услуга");
  }
  if (items.some(item => item.durationMin <= 0 || item.prepayKopecks <= 0)) {
    throw new UsecaseError("lab_pool_invalid", "услуга не настроена для онлайн-записи");
  }
  const rooms = await sql<{ id: number; title: string }[]>`
    select r.id, r.title from resources r
    join service_resources sr on sr.resource_id = r.id
    where r.kind = 'room' and r.active and sr.service_id in ${sql(ids)}
      and exists (select 1 from schedule_rules where resource_id = r.id)
    group by r.id, r.title
    having count(distinct sr.service_id) = ${ids.length}
    order by r.id limit 1`;
  const room = rooms[0];
  if (!room) throw new UsecaseError("lab_resource_missing", "для выбранных анализов нет общего процедурного кабинета");
  const linked = await sql<{ resourceId: number }[]>`
    select distinct r.id as resource_id from service_resources sr
    join resources r on r.id = sr.resource_id
    where sr.service_id in ${sql(ids)} and r.active order by r.id`;
  const resourceIds = [room.id, ...linked.map(row => row.resourceId).filter(id => id !== room.id)];
  const snapshot = makeLabPoolSnapshot(items);
  return { items: snapshot.items, resourceId: room.id, resourceTitle: room.title, resourceIds, snapshot };
}

export async function loadLabSlotRange(sql: Db, input: { serviceIds: number[]; fromDay: IsoDay; toDay: IsoDay }): Promise<LabSlotContext> {
  const pool = await loadLabPool(sql, input.serviceIds);
  const rules = await sql<Rule[]>`select resource_id, weekday, from_min, to_min from schedule_rules where resource_id in ${sql(pool.resourceIds)}`;
  const exceptions = await sql<ScheduleException[]>`select resource_id, to_char(day, 'YYYY-MM-DD') as day, kind, from_min, to_min
    from schedule_exceptions where resource_id in ${sql(pool.resourceIds)} and day between ${input.fromDay} and ${input.toDay}`;
  const busy = await sql<Busy[]>`select resource_id, starts_at, ends_at from booking_resources
    where active and resource_id in ${sql(pool.resourceIds)}
      and starts_at < ${localTime(input.toDay, 24 * 60)} and ends_at > ${localTime(input.fromDay, 0)}`;
  return { ...pool, rules, exceptions, busy };
}

export async function availableLabSlots(
  sql: Db, clock: Clock, input: { serviceIds: number[]; fromDay: IsoDay; days: number },
): Promise<{ pool: LabPool; days: { day: IsoDay; slots: Slot[] }[] }> {
  const now = clock.now();
  const loaded = await loadSettings(sql);
  const days = Array.from({ length: Math.max(0, input.days) }, (_, i) => addDays(input.fromDay, i));
  if (days.length === 0) return { pool: await loadLabPool(sql, input.serviceIds), days: [] };
  const ctx = await loadLabSlotRange(sql, { serviceIds: input.serviceIds, fromDay: days[0]!, toDay: days.at(-1)! });
  const settings = slotSettings(loaded, ctx.snapshot.durationMin, localDay(now));
  return {
    pool: ctx,
    days: days.map(day => ({ day, slots: freeSlots({ ...ctx, durationMin: ctx.snapshot.durationMin, day, now, settings }) })),
  };
}

export async function labCalendar(sql: Db, clock: Clock, serviceIds: number[]) {
  const now = clock.now();
  const today = localDay(now);
  const loaded = await loadSettings(sql);
  const pool = await loadLabPool(sql, serviceIds);
  const settings = slotSettings(loaded, pool.snapshot.durationMin, today);
  const availability = await availableLabSlots(sql, clock, { serviceIds, fromDay: today, days: settings.horizonDays + 1 });
  return {
    today,
    pool,
    days: availability.days.map(day => ({ day: day.day, slots: day.slots.map(slot => localMinutes(slot.startsAt)) })),
  };
}
