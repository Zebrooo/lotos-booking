// Врачи для поиска и страницы врача (дизайн v2): карточка со специальностью,
// услугами и ценами, отметкой о групповом приёме и ближайшим свободным временем.
import type { Db } from "@/lib/db/client";
import type { Clock } from "@/ports/clock";
import { localDay, localTime } from "@/domain/time";
import { splitName, nearestLabel } from "@/lib/format";
import { availableSlots } from "./availability";

export type DoctorService = { id: number; name: string; durationMin: number; priceKopecks: number; prepayKopecks: number; prepNote: string | null };
export type DoctorCard = {
  id: number; fullName: string; surname: string; given: string; spec: string; exp: string | null; room: string | null;
  services: DoctorService[]; hasGroup: boolean; nearest: string;
};
export type GroupDay = { day: string; minPatients: number; have: number; decideAt: Date };

type Row = { id: number; title: string; specialty: string | null; experience: string | null; room: string | null };

async function servicesOf(sql: Db, doctorIds: number[]): Promise<Map<number, DoctorService[]>> {
  const rows = await sql<(DoctorService & { doctorId: number })[]>`select sr.resource_id as doctor_id, s.id, s.title as name, s.duration_min,
      s.price_kopecks, s.prepay_kopecks, s.prep_note
    from service_resources sr join services s on s.id = sr.service_id
    where s.active and sr.resource_id in ${sql(doctorIds.length ? doctorIds : [0])} order by s.id`;
  const out = new Map<number, DoctorService[]>();
  for (const r of rows) {
    const { doctorId, ...svc } = r;
    out.set(doctorId, [...(out.get(doctorId) ?? []), svc]);
  }
  return out;
}

async function nearestFor(sql: Db, clock: Clock, doctorId: number, serviceId: number): Promise<string> {
  const today = localDay(clock.now());
  for (const span of [14, 100]) {
    const days = await availableSlots(sql, clock, { serviceId, doctorId, fromDay: today, days: span });
    const first = days.find(d => d.slots.length > 0);
    if (first) return nearestLabel(first.slots[0]!.startsAt, today);
  }
  return "нет мест";
}

export async function listDoctorCards(sql: Db, clock: Clock): Promise<DoctorCard[]> {
  const doctors = await sql<Row[]>`select id, title, specialty, experience, room from resources where kind = 'doctor' and active order by id`;
  const svcs = await servicesOf(sql, doctors.map(d => d.id));
  const today = localDay(clock.now());
  const groups = await sql<{ resourceId: number }[]>`select distinct resource_id from group_days where day >= ${today}`;
  const withGroup = new Set(groups.map(g => g.resourceId));
  const cards: DoctorCard[] = [];
  for (const d of doctors) {
    const services = svcs.get(d.id) ?? [];
    if (services.length === 0) continue;
    cards.push({
      id: d.id, fullName: d.title, ...splitName(d.title), spec: d.specialty ?? "", exp: d.experience, room: d.room,
      services, hasGroup: withGroup.has(d.id), nearest: await nearestFor(sql, clock, d.id, services[0]!.id),
    });
  }
  return cards;
}

export type DoctorPage = Omit<DoctorCard, "nearest" | "hasGroup"> & { groupDays: GroupDay[] };

export async function getDoctorPage(sql: Db, clock: Clock, id: number): Promise<DoctorPage | null> {
  if (!Number.isInteger(id) || id <= 0) return null;
  const [d] = await sql<Row[]>`select id, title, specialty, experience, room from resources where id = ${id} and kind = 'doctor' and active`;
  if (!d) return null;
  const services = (await servicesOf(sql, [d.id])).get(d.id) ?? [];
  if (services.length === 0) return null;
  const today = localDay(clock.now());
  const g = await sql<{ day: string; minPatients: number; decideAt: Date }[]>`select to_char(day, 'YYYY-MM-DD') as day, min_patients, decide_at
    from group_days where resource_id = ${d.id} and day >= ${today} order by day`;
  const groupDays: GroupDay[] = [];
  for (const x of g) {
    const [c] = await sql<{ n: number }[]>`select count(*)::int as n from bookings where resource_id = ${d.id}
      and status in ('pending', 'claimed', 'confirmed', 'arrived') and starts_at >= ${localTime(x.day, 0)} and starts_at < ${localTime(x.day, 1440)}`;
    groupDays.push({ ...x, have: c?.n ?? 0 });
  }
  return { id: d.id, fullName: d.title, ...splitName(d.title), spec: d.specialty ?? "", exp: d.experience, room: d.room, services, groupDays };
}
