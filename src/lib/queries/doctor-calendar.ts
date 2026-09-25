// Календарь врача для выбранной услуги: все дни до конца окна записи с
// отметками «выходной» и «группа» и сеткой времени [минуты, занято].
// Весь календарь уходит в браузер одним куском: лента дней, месяц и окна
// переключаются без запросов к серверу, как в прототипе.
import type { Db } from "@/lib/db/client";
import type { Clock } from "@/ports/clock";
import { type IsoDay, addDays, localDay, localMinutes } from "@/domain/time";
import { slotGrid, workIntervals } from "@/domain/slots";
import { loadSettings, slotSettings } from "@/lib/usecases/settings";
import { loadSlotRange } from "./availability";

export type CalendarDay = { day: IsoDay; off: boolean; group: boolean; slots: [number, 0 | 1][] };
export type DoctorCalendar = { today: IsoDay; openUntil: IsoDay | null; days: CalendarDay[] };

export async function doctorCalendar(sql: Db, clock: Clock, input: { doctorId: number; serviceId: number }): Promise<DoctorCalendar> {
  const now = clock.now();
  const today = localDay(now);
  const loaded = await loadSettings(sql);
  const probe = await loadSlotRange(sql, { serviceId: input.serviceId, doctorId: input.doctorId, fromDay: today, toDay: today });
  const settings = slotSettings(loaded, probe.service.durationMin, today);
  const last = addDays(today, settings.horizonDays);
  const ctx = await loadSlotRange(sql, { serviceId: input.serviceId, doctorId: input.doctorId, fromDay: today, toDay: last });
  const groups = await sql<{ day: string }[]>`select to_char(day, 'YYYY-MM-DD') as day from group_days
    where resource_id = ${input.doctorId} and day between ${today} and ${last}`;
  const groupSet = new Set(groups.map(g => g.day));
  const days: CalendarDay[] = [];
  for (let day = today; day <= last; day = addDays(day, 1)) {
    const off = workIntervals({ resourceId: input.doctorId, day, rules: ctx.rules, exceptions: ctx.exceptions }).length === 0;
    const grid = off ? [] : slotGrid({ ...ctx, durationMin: ctx.service.durationMin, day, now, settings });
    days.push({ day, off, group: groupSet.has(day), slots: grid.map(s => [localMinutes(s.startsAt), s.taken ? 1 : 0]) });
  }
  return { today, openUntil: loaded.bookingOpenUntil, days };
}
