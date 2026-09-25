// Запись с сайта v2: форма → удержание окна и код по СМС → подтверждение
// кода → бронь до срока или переход к онлайн-оплате. Телефон, на который
// пришёл код, становится входом в личный кабинет — как в прототипе.
import { nanoid } from "nanoid";
import type { Sql } from "@/lib/db/client";
import type { Clock } from "@/ports/clock";
import type { SmsSender } from "@/ports/sms";
import { localDay } from "@/domain/time";
import { reserveDeadline, type ReserveSettings } from "@/domain/reserve";
import { transition, type BookingStatus } from "@/domain/transitions";
import { fieldErrors, parseDob, phoneE164, CONSENT_ERROR, type FormV2, type Who } from "@/lib/forms/booking-v2";
import { startPatientSession } from "@/lib/cabinet/session";
import { holdSlot } from "./hold";
import { issueCode, verifyCode } from "./sms-codes";
import { loadSettings, type Settings } from "./settings";
import { UsecaseError, type UsecaseErrorCode } from "./errors";

export type StartDeps = { sms: SmsSender; clock: Clock; pepper: string; siteUrl: string; genCode?: () => string };
export type StartInput = {
  serviceId: number; doctorId: number; startsAt: Date; who: Who; form: FormV2;
  consentPd: boolean; consentPrepay: boolean; payChoice: "online" | "reserve"; ip?: string; userAgent?: string;
};
export type StartResult = { ok: true; token: string } | { ok: false; errors: Record<string, string> };

const HOLD_MESSAGES: Partial<Record<UsecaseErrorCode, string>> = {
  slot_taken: "Это время только что заняли. Выберите другое.",
  slot_past: "Это время уже недоступно для записи. Выберите другое.",
  slot_closed: "Врач в это время не принимает. Выберите другое.",
  beyond_horizon: "Запись на эту дату ещё не открыта.",
  duplicate_booking: "У пациента уже есть запись на это время.",
  online_paused: "Онлайн-запись временно недоступна, позвоните в регистратуру.",
  doctor_mismatch: "Услуга или врач недоступны для записи.",
  service_inactive: "Услуга или врач недоступны для записи.",
  not_found: "Услуга или врач недоступны для записи.",
  consent_missing: "Тексты согласий не опубликованы, запись временно недоступна.",
};

export const reserveSettings = (s: Settings): ReserveSettings => ({
  deadlineMin: s.reserveDeadlineMin, minLeadMinutes: s.reserveMinLeadMinutes,
  beforeVisitMinutes: s.reserveBeforeVisitMinutes, deskOpensMin: s.deskOpensMin,
});

/** Какой способ оплаты получится: выбор пациента, режим клиники и успевает ли касса. */
export function effectivePayMode(s: Settings, choice: "online" | "reserve", deadline: Date | null): "online" | "reserve" {
  if (s.payModel === "online" || !deadline) return "online";
  if (s.payModel === "reserve") return "reserve";
  return choice;
}

const codeText = (siteUrl: string, token: string) => (code: string) => `Лотос: код ${code}. Запись и оплата: ${siteUrl}/moya-zapis/${token}`;

export async function startBooking(sql: Sql, deps: StartDeps, input: StartInput): Promise<StartResult> {
  const now = deps.clock.now();
  const errors: Record<string, string> = { ...fieldErrors(input.who, input.form, localDay(now)) };
  if (!input.consentPd || !input.consentPrepay) errors.consent = CONSENT_ERROR;
  if (Object.keys(errors).length) return { ok: false, errors };

  const settings = await loadSettings(sql);
  const deadline = reserveDeadline({ now, startsAt: input.startsAt, settings: reserveSettings(settings) });
  const payMode = effectivePayMode(settings, input.payChoice, deadline);
  const contactPhone = phoneE164(input.form.phone);
  const patientPhone = input.who === "other" ? phoneE164(input.form.phone2) : contactPhone;
  const dob = parseDob(input.form.dob, localDay(now));
  if (!dob.ok) return { ok: false, errors: { dob: dob.err } };
  const consents = await sql<{ id: number }[]>`select distinct on (kind) id from consents order by kind, version desc`;

  let token: string, bookingId: number;
  try {
    const h = await holdSlot(sql, deps.clock, {
      serviceId: input.serviceId, doctorId: input.doctorId, startsAt: input.startsAt,
      patient: { fullName: input.form.fio.trim().replace(/\s+/g, " "), birthDate: dob.iso, phone: patientPhone, email: "" },
      booker: input.who === "child" ? { relation: "child", name: input.form.repFio.trim().replace(/\s+/g, " "), phone: contactPhone, email: "" }
        : input.who === "other" ? { relation: "relative", name: "", phone: contactPhone, email: "" } : undefined,
      consentIds: consents.map(c => c.id), ip: input.ip, userAgent: input.userAgent, source: "site",
    });
    token = h.token;
    bookingId = h.bookingId;
  } catch (e) {
    const message = e instanceof UsecaseError ? HOLD_MESSAGES[e.code] : undefined;
    if (message) return { ok: false, errors: { _form: message } };
    throw e;
  }
  await sql`update bookings set pay_mode = ${payMode}, patient_consent_token = ${input.who === "other" ? nanoid(21) : null} where id = ${bookingId}`;

  const sent = await issueCode(sql, deps, { phone: contactPhone, purpose: "booking", bookingId, text: codeText(deps.siteUrl, token) });
  if (!sent.ok) {
    await sql`update bookings set status = 'expired', hold_until = null where id = ${bookingId}`;
    await sql`update booking_resources set active = false where booking_id = ${bookingId}`;
    const message = sent.reason === "cooldown" ? "СМС на этот номер уже отправлено. Подождите минуту и попробуйте снова."
      : sent.reason === "too_many" ? "Слишком много кодов за час на этот номер. Запишитесь по телефону клиники."
      : "Не удалось отправить СМС. Попробуйте ещё раз или позвоните в клинику.";
    return { ok: false, errors: { _form: message } };
  }
  return { ok: true, token };
}

type HeldRow = {
  id: number; status: BookingStatus; payMode: "online" | "reserve"; startsAt: Date; holdUntil: Date | null;
  phoneVerifiedAt: Date | null; bookerPhone: string | null; patientPhone: string; patientConsentToken: string | null;
};

async function loadHeld(sql: Sql, token: string): Promise<HeldRow | undefined> {
  const [b] = await sql<HeldRow[]>`select b.id, b.status, b.pay_mode, b.starts_at, b.hold_until, b.phone_verified_at, b.booker_phone,
      p.phone as patient_phone, b.patient_consent_token
    from bookings b join patients p on p.id = b.patient_id where b.token = ${token}`;
  return b;
}

export type ConfirmResult = { ok: true; next: "pay" | "done"; sessionToken: string } | { ok: false; error: string };

export async function confirmBookingCode(sql: Sql, deps: StartDeps, input: { token: string; code: string }): Promise<ConfirmResult> {
  const now = deps.clock.now();
  const b = await loadHeld(sql, input.token);
  if (!b) return { ok: false, error: "Запись не найдена" };
  if (b.status !== "held" || !b.holdUntil || b.holdUntil <= now) return { ok: false, error: "Время удержания истекло — выберите время заново" };
  const phone = b.bookerPhone ?? b.patientPhone;
  const v = await verifyCode(sql, deps.clock, { phone, purpose: "booking", code: input.code.replace(/\D/g, ""), pepper: deps.pepper });
  if (!v.ok) {
    return { ok: false, error: v.reason === "invalid" ? "Неверный код. Проверьте цифры из СМС"
      : v.reason === "too_many" ? "Слишком много попыток — запросите новый код" : "Код устарел — запросите новый" };
  }
  const settings = await loadSettings(sql);
  let next: "pay" | "done" = "pay";
  await sql.begin(async tx => {
    await tx`update bookings set phone_verified_at = ${now} where id = ${b.id}`;
    if (b.payMode === "reserve") {
      const deadline = reserveDeadline({ now, startsAt: b.startsAt, settings: reserveSettings(settings) });
      const t = transition(b.status, "reserve", "system");
      if (deadline && t.ok) {
        await tx`update bookings set status = ${t.status}, pay_deadline = ${deadline}, hold_until = null where id = ${b.id}`;
        next = "done";
      } else {
        await tx`update bookings set pay_mode = 'online' where id = ${b.id}`;
      }
    }
  });
  if (b.patientConsentToken) {
    await deps.sms.send(b.patientPhone, `Лотос: вас записали на приём. Подтвердите согласие: ${deps.siteUrl}/soglasie/${b.patientConsentToken}`);
  }
  const sessionToken = await startPatientSession(sql, deps.clock, phone);
  return { ok: true, next, sessionToken };
}

export async function resendBookingCode(sql: Sql, deps: StartDeps, token: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const now = deps.clock.now();
  const b = await loadHeld(sql, token);
  if (!b || b.status !== "held" || !b.holdUntil || b.holdUntil <= now) return { ok: false, error: "Время удержания истекло — выберите время заново" };
  const r = await issueCode(sql, deps, { phone: b.bookerPhone ?? b.patientPhone, purpose: "booking", bookingId: b.id, text: codeText(deps.siteUrl, token) });
  if (r.ok) return { ok: true };
  if (r.reason === "cooldown") return { ok: false, error: `Отправить повторно можно через ${Math.ceil((r.retryAt.getTime() - now.getTime()) / 1000)} с` };
  return { ok: false, error: r.reason === "too_many" ? "Слишком много кодов за час. Позвоните в клинику." : "Не удалось отправить СМС" };
}
