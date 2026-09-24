// src/lib/usecases/settings.ts
import type { Db } from "@/lib/db/client";
export type Settings = {
  freeCancelHours: number; holdMinutes: number; leadMinutes: number; horizonDays: number;
  reminderHoursBefore: number; coolingOffMinutes: number; arriveEarlyMinutes: number;
  slotStepMin: number; onlineBookingPaused: boolean;
};
export async function loadSettings(sql: Db): Promise<Settings> {
  const [row] = await sql<Settings[]>`select free_cancel_hours, hold_minutes, lead_minutes, horizon_days,
    reminder_hours_before, cooling_off_minutes, arrive_early_minutes, slot_step_min, online_booking_paused
    from settings where id = 1`;
  if (!row) throw new Error("settings пуста");
  return row;
}

/** Настройки сетки окон для src/domain/slots.ts. */
export function slotSettings(s: Settings) {
  return { stepMin: s.slotStepMin, leadMinutes: s.leadMinutes, horizonDays: s.horizonDays };
}
