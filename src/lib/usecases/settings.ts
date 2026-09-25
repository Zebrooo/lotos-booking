// src/lib/usecases/settings.ts
import type { Db } from "@/lib/db/client";
export type Settings = {
  freeCancelHours: number; holdMinutes: number; leadMinutes: number; horizonDays: number;
  reminderHoursBefore: number; coolingOffMinutes: number; arriveEarlyMinutes: number;
  slotStepMin: number | null; onlineBookingPaused: boolean;
  payModel: "both" | "online" | "reserve"; reserveDeadlineMin: number; reserveMinLeadMinutes: number;
  reserveBeforeVisitMinutes: number; deskOpensMin: number; bookingOpenUntil: string | null;
  pausedAt: Date | null; pausedBy: string | null; pausedReason: string | null; pausedComment: string | null;
};
export async function loadSettings(sql: Db): Promise<Settings> {
  const [row] = await sql<Settings[]>`select free_cancel_hours, hold_minutes, lead_minutes, horizon_days,
    reminder_hours_before, cooling_off_minutes, arrive_early_minutes, slot_step_min, online_booking_paused,
    pay_model, reserve_deadline_min, reserve_min_lead_minutes, reserve_before_visit_minutes, desk_opens_min,
    to_char(booking_open_until, 'YYYY-MM-DD') as booking_open_until, paused_at, paused_by, paused_reason, paused_comment
    from settings where id = 1`;
  if (!row) throw new Error("settings пуста");
  return row;
}

/**
 * Настройки сетки окон для src/domain/slots.ts. Пустой шаг — длительность
 * услуги (как в дизайне v2); горизонт — не дальше даты «запись открыта до».
 */
export function slotSettings(s: Settings, durationMin: number, today: string) {
  let horizonDays = s.horizonDays;
  if (s.bookingOpenUntil) {
    const untilDays = Math.round((Date.parse(`${s.bookingOpenUntil}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86400_000);
    horizonDays = Math.max(0, Math.min(horizonDays, untilDays));
  }
  return { stepMin: s.slotStepMin ?? durationMin, leadMinutes: s.leadMinutes, horizonDays };
}
