// Каталог для пациента: услуги с врачами и врачи с услугами. Клиника
// маленькая, поэтому поиск идёт в памяти: так регистр кириллицы и «ё» не
// зависят от локали базы.
import type { Db } from "@/lib/db/client";

export type ServiceKind = "consultation" | "ultrasound" | "analysis" | "diagnostics";
export type DoctorRef = { id: number; title: string; specialty: string | null };
export type CatalogService = {
  id: number; title: string; kind: ServiceKind; durationMin: number; priceKopecks: number;
  prepayKopecks: number; prepNote: string | null; doctors: DoctorRef[];
};
export type CatalogDoctor = DoctorRef & { services: { id: number; title: string }[] };
export type Catalog = { services: CatalogService[]; doctors: CatalogDoctor[] };

const KIND_ORDER: ServiceKind[] = ["consultation", "ultrasound", "diagnostics", "analysis"];

type Row = {
  serviceId: number; serviceTitle: string; kind: ServiceKind; durationMin: number; priceKopecks: number;
  prepayKopecks: number; prepNote: string | null; doctorId: number; doctorTitle: string; specialty: string | null;
};

async function loadRows(sql: Db, serviceId?: number): Promise<Row[]> {
  return sql<Row[]>`select s.id as service_id, s.title as service_title, s.kind, s.duration_min, s.price_kopecks,
      s.prepay_kopecks, s.prep_note, r.id as doctor_id, r.title as doctor_title, r.specialty
    from services s
    join service_resources sr on sr.service_id = s.id
    join resources r on r.id = sr.resource_id and r.kind = 'doctor' and r.active
    where s.active ${serviceId != null ? sql`and s.id = ${serviceId}` : sql``}`;
}

const fold = (s: string) => s.toLocaleLowerCase("ru").replaceAll("ё", "е").trim();
const byTitle = (a: { title: string }, b: { title: string }) => a.title.localeCompare(b.title, "ru");

function build(rows: Row[]): Catalog {
  const services = new Map<number, CatalogService>();
  const doctors = new Map<number, CatalogDoctor>();
  for (const r of rows) {
    const svc = services.get(r.serviceId) ?? {
      id: r.serviceId, title: r.serviceTitle, kind: r.kind, durationMin: r.durationMin,
      priceKopecks: r.priceKopecks, prepayKopecks: r.prepayKopecks, prepNote: r.prepNote, doctors: [],
    };
    svc.doctors.push({ id: r.doctorId, title: r.doctorTitle, specialty: r.specialty });
    services.set(r.serviceId, svc);
    const doc = doctors.get(r.doctorId) ?? { id: r.doctorId, title: r.doctorTitle, specialty: r.specialty, services: [] };
    doc.services.push({ id: r.serviceId, title: r.serviceTitle });
    doctors.set(r.doctorId, doc);
  }
  const svcList = [...services.values()]
    .map(s => ({ ...s, doctors: s.doctors.sort(byTitle) }))
    .sort((a, b) => KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind) || byTitle(a, b));
  const docList = [...doctors.values()]
    .map(d => ({ ...d, services: d.services.sort(byTitle) }))
    .sort((a, b) => (a.specialty ?? "").localeCompare(b.specialty ?? "", "ru") || byTitle(a, b));
  return { services: svcList, doctors: docList };
}

/**
 * Поиск: услуга подходит, если запрос есть в её названии или у одного из её
 * врачей в фамилии или специальности; врач — если запрос в его фамилии,
 * специальности или в названии одной из его услуг.
 */
export async function listCatalog(sql: Db, q?: string): Promise<Catalog> {
  const all = build(await loadRows(sql));
  const needle = fold(q ?? "");
  if (!needle) return all;
  const hit = (s: string | null) => s != null && fold(s).includes(needle);
  const doctorHit = (d: DoctorRef) => hit(d.title) || hit(d.specialty);
  return {
    services: all.services.filter(s => hit(s.title) || s.doctors.some(doctorHit)),
    doctors: all.doctors.filter(d => doctorHit(d) || d.services.some(s => hit(s.title))),
  };
}

/** Одна активная услуга с активными врачами; null — нет такой или её не оказывают. */
export async function getServiceWithDoctors(sql: Db, serviceId: number): Promise<CatalogService | null> {
  if (!Number.isInteger(serviceId) || serviceId <= 0) return null;
  return build(await loadRows(sql, serviceId)).services[0] ?? null;
}
