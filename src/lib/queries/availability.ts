// Свободные окна для пациента: одна загрузка правил, исключений и занятости
// на весь диапазон дней, дальше чистый расчёт по дням (src/domain/slots.ts).
import type { Db } from "@/lib/db/client";
import type { Clock } from "@/ports/clock";
import { type IsoDay, addDays, localTime } from "@/domain/time";
import { freeSlots, type Rule, type ScheduleException, type Busy, type Slot } from "@/domain/slots";
import { UsecaseError } from "@/lib/usecases/errors";
import { loadSettings, slotSettings } from "@/lib/usecases/settings";

export type ServiceRow = {
  id: number; title: string; kind: string; durationMin: number; priceKopecks: number;
  prepayKopecks: number; prepNote: string | null; active: boolean;
};
export type SlotContext = { service: ServiceRow; resourceIds: number[]; rules: Rule[]; exceptions: ScheduleException[]; busy: Busy[] };

/**
 * Услуга, её ресурсы для выбранного врача, правила, исключения и занятость
 * за дни fromDay…toDay включительно. Ресурсы: врач плюс все активные
 * ресурсы услуги другого вида (аппарат, кабинет).
 */
export async function loadSlotRange(sql: Db, input: { serviceId: number; doctorId: number; fromDay: IsoDay; toDay: IsoDay }): Promise<SlotContext> {
  const [service] = await sql<ServiceRow[]>`select id, title, kind, duration_min, price_kopecks, prepay_kopecks, prep_note, active
    from services where id = ${input.serviceId}`;
  if (!service) throw new UsecaseError("not_found", "услуга не найдена");
  if (!service.active) throw new UsecaseError("service_inactive", "услуга не оказывается");
  const linked = await sql<{ resourceId: number; kind: string; active: boolean }[]>`select r.id as resource_id, r.kind, r.active
    from service_resources sr join resources r on r.id = sr.resource_id where sr.service_id = ${service.id}`;
  const doctor = linked.find(r => r.resourceId === input.doctorId && r.kind === "doctor" && r.active);
  if (!doctor) throw new UsecaseError("doctor_mismatch", "врач не оказывает эту услугу");
  const resourceIds = [input.doctorId, ...linked.filter(r => r.kind !== "doctor" && r.active).map(r => r.resourceId)];
  const rules = await sql<Rule[]>`select resource_id, weekday, from_min, to_min from schedule_rules where resource_id in ${sql(resourceIds)}`;
  const exceptions = await sql<ScheduleException[]>`select resource_id, to_char(day, 'YYYY-MM-DD') as day, kind, from_min, to_min
    from schedule_exceptions where resource_id in ${sql(resourceIds)} and day between ${input.fromDay} and ${input.toDay}`;
  const from = localTime(input.fromDay, 0);
  const to = localTime(input.toDay, 24 * 60);
  const busy = await sql<Busy[]>`select resource_id, starts_at, ends_at from booking_resources
    where active and resource_id in ${sql(resourceIds)} and starts_at < ${to} and ends_at > ${from}`;
  return { service, resourceIds, rules, exceptions, busy };
}

export async function availableSlots(
  sql: Db, clock: Clock, input: { serviceId: number; doctorId: number; fromDay: IsoDay; days: number },
): Promise<{ day: IsoDay; slots: Slot[] }[]> {
  const now = clock.now();
  const settings = slotSettings(await loadSettings(sql));
  const days = Array.from({ length: Math.max(0, input.days) }, (_, i) => addDays(input.fromDay, i));
  if (days.length === 0) return [];
  const ctx = await loadSlotRange(sql, { serviceId: input.serviceId, doctorId: input.doctorId, fromDay: days[0]!, toDay: days.at(-1)! });
  return days.map(day => ({
    day,
    slots: freeSlots({ ...ctx, durationMin: ctx.service.durationMin, day, now, settings }),
  }));
}
