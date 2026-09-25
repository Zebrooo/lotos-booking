// Общее для страниц CRM за один запрос: сотрудник, настройки, запрос врача.
import { cache } from "react";
import { app } from "@/lib/app";
import { loadSettings } from "@/lib/usecases/settings";
import { requireStaff } from "@/lib/staff/session-view";
import { localDay } from "@/domain/time";
import { hhmmOf } from "@/lib/format";
import type { StaffRole } from "@/lib/staff/auth";

export const crmContext = cache(async (roles?: StaffRole[]) => {
  const staff = await requireStaff(roles);
  const { sql, adapters } = app();
  const settings = await loadSettings(sql);
  const now = adapters.clock.now();
  const pauseInfo = settings.onlineBookingPaused
    ? [settings.pausedAt ? `с ${hhmmOf(settings.pausedAt)}` : "", settings.pausedBy, `${settings.pausedReason ?? ""}${settings.pausedComment ? ` — ${settings.pausedComment}` : ""}`].filter(Boolean).join(" · ")
    : "";
  const [req] = staff.role === "doctor" ? [] : await sql<{ resourceId: number; day: string; reason: string; text: string }[]>`
    select resource_id, to_char(day, 'YYYY-MM-DD') as day, reason, text from doctor_requests
    where handled_at is null and day >= ${localDay(now)} order by created_at limit 1`;
  return { staff, settings, now, pauseInfo, request: req ?? null };
});
