// Запись глазами пациента: что с ней, что с деньгами и что сейчас можно
// сделать. Все «можно» считаются здесь, чтобы страница только рисовала.
import type { Db } from "@/lib/db/client";
import type { Clock } from "@/ports/clock";
import { transition, STATUS_LABEL, type BookingStatus } from "@/domain/transitions";
import { cancelOutcome, canTransfer, type CancelOutcome } from "@/domain/cancel";
import { moneyState, type LedgerRow, type MoneyState } from "@/domain/money";
import { loadSettings } from "@/lib/usecases/settings";

export type BookingView = {
  token: string; status: BookingStatus; statusLabel: string;
  serviceId: number; doctorId: number;
  service: { title: string; durationMin: number; prepayKopecks: number; prepNote: string | null };
  doctor: { title: string; specialty: string | null };
  startsAt: Date; endsAt: Date; holdUntil: Date | null; paidAt: Date | null;
  money: MoneyState; prepayKopecks: number; refundPending: boolean;
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
  service: { title: string; durationMin: number; prepayKopecks: number };
  prepNote: string | null; doctorTitle: string; specialty: string | null;
  startsAt: Date; endsAt: Date; holdUntil: Date | null; paidAt: Date | null;
  fullName: string; email: string;
};

export async function getBookingView(sql: Db, clock: Clock, token: string): Promise<BookingView | null> {
  if (!/^[A-Za-z0-9_-]{21}$/.test(token)) return null;
  const [b] = await sql<Row[]>`select b.id, b.token, b.status, b.service_id, b.resource_id, b.service, s.prep_note,
      r.title as doctor_title, r.specialty, b.starts_at, b.ends_at, b.hold_until, b.paid_at, p.full_name, p.email
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
  return {
    token: b.token, status: b.status, statusLabel: STATUS_LABEL[b.status],
    serviceId: b.serviceId, doctorId: b.resourceId,
    service: { title: b.service.title, durationMin: b.service.durationMin, prepayKopecks: b.service.prepayKopecks, prepNote: b.prepNote },
    doctor: { title: b.doctorTitle, specialty: b.specialty },
    startsAt: b.startsAt, endsAt: b.endsAt, holdUntil: b.holdUntil, paidAt: b.paidAt,
    money: moneyState(ledger), prepayKopecks: b.service.prepayKopecks, refundPending: (refund?.n ?? 0) > 0,
    canPay: b.status === "held" && b.holdUntil != null && b.holdUntil > now,
    canCancel: transition(b.status, "cancel", "patient").ok,
    canTransfer: transition(b.status, "transfer", "patient").ok && canTransfer({ now, startsAt: b.startsAt, actor: "patient", settings }),
    cancelPreview: cancelOutcome({ now, startsAt: b.startsAt, paidAt: b.paidAt, actor: "patient", settings }),
    freeCancelHours: settings.freeCancelHours, arriveEarlyMinutes: settings.arriveEarlyMinutes,
    patientName: b.fullName, emailMasked: maskEmail(b.email),
  };
}
