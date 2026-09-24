// Удержание слота: одна транзакция — пациент, запись held, ресурсы, согласия.
// Двойную продажу отбивает исключающее ограничение базы; код лишь переводит
// её в понятную ошибку.
import { nanoid } from "nanoid";
import type { Sql, Db } from "@/lib/db/client";
import type { Clock } from "@/ports/clock";
import { localDay, addMinutes } from "@/domain/time";
import { isSlotFree } from "@/domain/slots";
import { loadSlotRange, type SlotContext } from "@/lib/queries/availability";
import { holdUntil as computeHoldUntil } from "@/domain/cancel";
import { UsecaseError, isExclusionViolation } from "./errors";
import { loadSettings, slotSettings } from "./settings";

export type HoldInput = {
  serviceId: number; doctorId: number; startsAt: Date;
  patient: { fullName: string; birthDate: string; phone: string; email: string };
  booker?: { relation: "child" | "relative"; name: string; phone: string; email: string };
  consentIds: number[]; ip?: string; userAgent?: string; source?: "site" | "admin";
};
export type HoldResult = { bookingId: number; token: string; holdUntil: Date; endsAt: Date; prepayKopecks: number };

/** Контекст окон на один день; см. loadSlotRange. */
export function loadSlotContext(sql: Db, input: { serviceId: number; doctorId: number; day: string }): Promise<SlotContext> {
  return loadSlotRange(sql, { serviceId: input.serviceId, doctorId: input.doctorId, fromDay: input.day, toDay: input.day });
}

export async function holdSlot(sql: Sql, clock: Clock, input: HoldInput): Promise<HoldResult> {
  const now = clock.now();
  const settings = await loadSettings(sql);
  if (settings.onlineBookingPaused && (input.source ?? "site") === "site") {
    throw new UsecaseError("online_paused", "онлайн-запись приостановлена");
  }
  const day = localDay(input.startsAt);
  const ctx = await loadSlotContext(sql, { serviceId: input.serviceId, doctorId: input.doctorId, day });
  const check = isSlotFree({ ...ctx, resourceIds: ctx.resourceIds, durationMin: ctx.service.durationMin, startsAt: input.startsAt, now, settings: slotSettings(settings) });
  if (!check.ok) {
    const code = ({ closed: "slot_closed", past: "slot_past", beyond_horizon: "beyond_horizon", taken: "slot_taken" } as const)[check.reason];
    throw new UsecaseError(code, "окно недоступно");
  }
  const consents = await sql<{ id: number; kind: string }[]>`select id, kind from consents where id in ${sql(input.consentIds.length ? input.consentIds : [0])}`;
  const kinds = new Set(consents.map(c => c.kind));
  if (!kinds.has("personal_data") || !kinds.has("prepay_terms")) throw new UsecaseError("consent_missing", "нужны оба согласия");

  const endsAt = addMinutes(input.startsAt, ctx.service.durationMin);
  const holdUntil = computeHoldUntil({ now, startsAt: input.startsAt, settings: { holdMinutes: settings.holdMinutes, leadMinutes: settings.leadMinutes } });
  const token = nanoid(21);
  const snapshot = { title: ctx.service.title, kind: ctx.service.kind, durationMin: ctx.service.durationMin, priceKopecks: ctx.service.priceKopecks, prepayKopecks: ctx.service.prepayKopecks };

  try {
    const bookingId = await sql.begin(async tx => {
      const [p] = await tx<{ id: number }[]>`insert into patients (full_name, birth_date, phone, email)
        values (${input.patient.fullName}, ${input.patient.birthDate}, ${input.patient.phone}, ${input.patient.email})
        on conflict (phone, birth_date) do update set full_name = excluded.full_name, email = excluded.email returning id`;
      const dup = await tx`select 1 from bookings where patient_id = ${p!.id} and status in ('held', 'confirmed')
        and starts_at < ${endsAt} and ends_at > ${input.startsAt} limit 1`;
      if (dup.length > 0) throw new UsecaseError("duplicate_booking", "у пациента уже есть запись на это время");
      const [b] = await tx<{ id: number }[]>`insert into bookings (token, patient_id, service_id, service, resource_id, starts_at, ends_at, status, hold_until, source,
          booker_relation, booker_name, booker_phone, booker_email, created_at)
        values (${token}, ${p!.id}, ${ctx.service.id}, ${tx.json(snapshot)}, ${input.doctorId}, ${input.startsAt}, ${endsAt}, 'held', ${holdUntil}, ${input.source ?? "site"},
          ${input.booker?.relation ?? "self"}, ${input.booker?.name ?? null}, ${input.booker?.phone ?? null}, ${input.booker?.email ?? null}, ${now}) returning id`;
      for (const rid of ctx.resourceIds) {
        await tx`insert into booking_resources (booking_id, resource_id, starts_at, ends_at) values (${b!.id}, ${rid}, ${input.startsAt}, ${endsAt})`;
      }
      for (const c of consents) {
        await tx`insert into booking_consents (booking_id, consent_id, ip, user_agent) values (${b!.id}, ${c.id}, ${input.ip ?? null}, ${input.userAgent ?? null})`;
      }
      return b!.id;
    });
    return { bookingId, token, holdUntil, endsAt, prepayKopecks: ctx.service.prepayKopecks };
  } catch (e) {
    if (isExclusionViolation(e)) throw new UsecaseError("slot_taken", "окно только что заняли");
    throw e;
  }
}
