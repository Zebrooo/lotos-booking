// Согласие взрослого пациента, которого записал другой человек («Другой
// взрослый» в дизайне v2). Пациент открывает ссылку из СМС, видит запись и
// даёт согласие на обработку своих данных; записавшему уходит СМС.
import type { Sql, Db } from "@/lib/db/client";
import type { Clock } from "@/ports/clock";
import { localDay } from "@/domain/time";
import { holdsResources, type BookingStatus } from "@/domain/transitions";
import { dateNum, hhmmOf, relName, wdShort, shortName } from "@/lib/format";
import { getLatestConsent } from "@/lib/queries/consents";
import { queueSms } from "./contact";

export type ConsentView = {
  state: "pending" | "given" | "closed";
  patient: string; doctor: string; specialty: string | null; service: string; when: string; recorderPhone: string;
  consent: { title: string; version: number; publishedOn: string; body: string };
};

const CLOSED = "Запись отменена или уже прошла";
const mask = (e164: string) => `+7 ${e164.slice(2, 5)} ***-**-${e164.slice(-2)}`;

type Row = { id: number; status: BookingStatus; startsAt: Date; service: { title: string }; consentAt: Date | null; bookerPhone: string | null;
  patient: string; resourceTitle: string; resourceKind: string; specialty: string | null };

async function find(sql: Db, token: string, forUpdate = false): Promise<Row | null> {
  const [b] = await sql<Row[]>`select b.id, b.status, b.starts_at, b.service, b.patient_consent_at as consent_at, b.booker_phone,
      p.full_name as patient, r.title as resource_title, r.kind as resource_kind, r.specialty
    from bookings b join patients p on p.id = b.patient_id join resources r on r.id = b.resource_id
    where b.patient_consent_token = ${token} ${forUpdate ? sql`for update of b` : sql``}`;
  return b ?? null;
}
const isClosed = (b: Row, now: Date) => !holdsResources(b.status) || b.startsAt <= now;

export async function consentView(sql: Sql, clock: Clock, token: string): Promise<ConsentView | null> {
  const b = await find(sql, token);
  if (!b) return null;
  const c = await getLatestConsent(sql, "personal_data");
  if (!c) return null;
  const now = clock.now();
  const day = localDay(b.startsAt);
  return {
    state: isClosed(b, now) ? "closed" : b.consentAt ? "given" : "pending",
    patient: b.patient, doctor: b.resourceKind === "doctor" ? shortName(b.resourceTitle) : b.resourceTitle, specialty: b.specialty,
    service: b.service.title, when: `${relName(day, localDay(now)) || wdShort(day)}, ${dateNum(day)}, ${hhmmOf(b.startsAt)}`,
    recorderPhone: b.bookerPhone ? mask(b.bookerPhone) : "",
    consent: { title: "Согласие на обработку персональных данных", version: c.version, publishedOn: localDay(c.publishedAt), body: c.body },
  };
}

export async function givePatientConsent(sql: Sql, clock: Clock, input: { token: string; ip?: string; userAgent?: string }): Promise<{ ok: true } | { ok: false; error: string }> {
  const now = clock.now();
  return sql.begin(async tx => {
    const b = await find(tx, input.token, true);
    if (!b) return { ok: false as const, error: "Ссылка недействительна" };
    if (isClosed(b, now)) return { ok: false as const, error: CLOSED };
    if (b.consentAt) return { ok: true as const };
    const c = await getLatestConsent(tx, "personal_data");
    if (!c) return { ok: false as const, error: "Текст согласия не опубликован" };
    await tx`update bookings set patient_consent_at = ${now}, patient_consent_id = ${c.id},
      patient_consent_ip = ${input.ip ?? null}, patient_consent_ua = ${input.userAgent?.slice(0, 500) ?? null} where id = ${b.id}`;
    await queueSms(tx, b.id, "booking_consent_given");
    return { ok: true as const };
  });
}
