// Запись глазами пациента: что с ней, что с деньгами и что сейчас можно
// сделать. Все «можно» считаются здесь, чтобы страница только рисовала.
import type { Db } from "@/lib/db/client";
import type { Clock } from "@/ports/clock";
import { transition, STATUS_LABEL, type BookingStatus } from "@/domain/transitions";
import { cancelOutcome, canTransfer, type CancelOutcome } from "@/domain/cancel";
import { moneyState, type LedgerRow, type MoneyState } from "@/domain/money";
import { loadSettings } from "@/lib/usecases/settings";
import { maskPhone } from "@/lib/forms/booking-v2";
import { advanceSource } from "@/lib/usecases/cancel";

export type BookingView = {
  id: number; token: string; status: BookingStatus; statusLabel: string; priceKopecks: number;
  payMode: "online" | "reserve"; payDeadline: Date | null;
  relation: "self" | "child" | "relative"; recorder: string; contactPhone: string; consentPending: boolean;
  cancelledAt: Date | null; cancelledBy: "patient" | "clinic" | null; cancelReason: string | null;
  serviceId: number; doctorId: number;
  service: { title: string; durationMin: number; prepayKopecks: number; prepNote: string | null };
  doctor: { title: string; specialty: string | null };
  startsAt: Date; endsAt: Date; holdUntil: Date | null; paidAt: Date | null;
  money: MoneyState; prepayKopecks: number; refundPending: boolean;
  /** Как вернётся аванс при отмене: на карту, наличными или переводом. */
  refundHow: "card" | "cash" | "bank";
  /** После переноса — токен новой записи, иначе null. */
  transferredToToken: string | null;
  canPay: boolean; canCancel: boolean; canTransfer: boolean; cancelPreview: CancelOutcome;
  freeCancelHours: number; arriveEarlyMinutes: number;
  patientName: string; emailMasked: string;
};

export function maskEmail(email: string): string {
  const at = email.indexOf("@");
  if (at <= 0) return "***";
  return `${email[0]}***${email.slice(at)}`;
}

type Row = {
  id: number; token: string; status: BookingStatus; serviceId: number; resourceId: number;
  service: { title: string; durationMin: number; prepayKopecks: number; priceKopecks: number };
  prepNote: string | null; doctorTitle: string; specialty: string | null;
  startsAt: Date; endsAt: Date; holdUntil: Date | null; paidAt: Date | null;
  fullName: string; email: string; patientPhone: string; payMode: "online" | "reserve"; payDeadline: Date | null;
  bookerRelation: "self" | "child" | "relative"; bookerName: string | null; bookerPhone: string | null;
  patientConsentToken: string | null; patientConsentAt: Date | null;
  cancelledAt: Date | null; cancelledBy: "patient" | "clinic" | null; cancelReason: string | null;
};

export async function getBookingView(sql: Db, clock: Clock, token: string): Promise<BookingView | null> {
  if (!/^[A-Za-z0-9_-]{21}$/.test(token)) return null;
  const [b] = await sql<Row[]>`select b.id, b.token, b.status, b.service_id, b.resource_id, b.service, s.prep_note,
      r.title as doctor_title, r.specialty, b.starts_at, b.ends_at, b.hold_until, b.paid_at, p.full_name, p.email,
      p.phone as patient_phone, b.pay_mode, b.pay_deadline, b.booker_relation, b.booker_name, b.booker_phone,
      b.patient_consent_token, b.patient_consent_at, b.cancelled_at, b.cancelled_by, b.cancel_reason
    from bookings b
    join patients p on p.id = b.patient_id
    join resources r on r.id = b.resource_id
    join services s on s.id = b.service_id
    where b.token = ${token}`;
  if (!b) return null;
  const now = clock.now();
  const settings = await loadSettings(sql);
  const ledger = await sql<LedgerRow[]>`select kind, amount_kopecks from ledger where booking_id = ${b.id} order by id`;
  const [refund] = await sql<{ n: number }[]>`select count(*)::int as n from refunds where booking_id = ${b.id} and status <> 'done'`;
  const [next] = b.status === "transferred"
    ? await sql<{ token: string }[]>`select token from bookings where transferred_from_id = ${b.id} order by id desc limit 1`
    : [];
  const src = await advanceSource(sql, b.id);
  const contactPhone = b.bookerPhone ?? b.patientPhone;
  const recorder = b.bookerRelation === "child" ? `${b.bookerName ?? ""} (представитель)`
    : b.bookerRelation === "relative" ? maskPhone(contactPhone) : b.fullName;
  return {
    id: b.id, token: b.token, status: b.status, statusLabel: STATUS_LABEL[b.status], priceKopecks: b.service.priceKopecks ?? 0,
    payMode: b.payMode, payDeadline: b.payDeadline, relation: b.bookerRelation, recorder, contactPhone,
    consentPending: b.patientConsentToken != null && b.patientConsentAt == null,
    cancelledAt: b.cancelledAt, cancelledBy: b.cancelledBy, cancelReason: b.cancelReason,
    serviceId: b.serviceId, doctorId: b.resourceId,
    service: { title: b.service.title, durationMin: b.service.durationMin, prepayKopecks: b.service.prepayKopecks, prepNote: b.prepNote },
    doctor: { title: b.doctorTitle, specialty: b.specialty },
    startsAt: b.startsAt, endsAt: b.endsAt, holdUntil: b.holdUntil, paidAt: b.paidAt,
    money: moneyState(ledger), prepayKopecks: b.service.prepayKopecks, refundPending: (refund?.n ?? 0) > 0,
    refundHow: src.paymentId || !src.channel ? "card" : src.channel === "cash" ? "cash" : "bank",
    transferredToToken: next?.token ?? null,
    canPay: (b.status === "held" && b.holdUntil != null && b.holdUntil > now)
      || ((b.status === "pending" || b.status === "claimed") && b.payDeadline != null && b.payDeadline > now),
    canCancel: transition(b.status, "cancel", "patient").ok,
    canTransfer: transition(b.status, "transfer", "patient").ok && canTransfer({ now, startsAt: b.startsAt, actor: "patient", settings }),
    cancelPreview: cancelOutcome({ now, startsAt: b.startsAt, paidAt: b.paidAt, actor: "patient", settings }),
    freeCancelHours: settings.freeCancelHours, arriveEarlyMinutes: settings.arriveEarlyMinutes,
    patientName: b.fullName, emailMasked: maskEmail(b.email),
  };
}
