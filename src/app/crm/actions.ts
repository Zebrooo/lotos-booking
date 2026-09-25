"use server";
// Серверные действия CRM. Каждое заново проверяет сессию и роль сотрудника:
// из браузера приходят только номера записей и выбранные варианты.
import { redirect } from "next/navigation";
import { app } from "@/lib/app";
import { staffLogin, endStaffSession } from "@/lib/staff/auth";
import { requireStaff, setStaffCookie, readStaffCookie, clearStaffCookie } from "@/lib/staff/session-view";
import {
  recordCash, markArrived, staffDone, staffNoShow, giveManualRefund, staffCancel, staffMove, moveOptions, reconcile,
  pauseOnline, resumeOnline, requestDayOff, closeDoctorDay, type DayDecision,
} from "@/lib/crm/actions";
import { crmBookings } from "@/lib/crm/data";
import { rub } from "@/lib/format";

type R = { ok: boolean; error: string | null };
const done = (r: { ok: true } | { ok: false; error: string }): R => (r.ok ? { ok: true, error: null } : { ok: false, error: r.error });
const id = (v: unknown) => { const n = Number(v); return Number.isSafeInteger(n) && n > 0 ? n : 0; };
const isoDay = (v: unknown) => (typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : "");

export async function loginStaffAction(email: string, password: string): Promise<{ error: string }> {
  const { sql, adapters } = app();
  const r = await staffLogin(sql, adapters.clock, { email: String(email), password: String(password) });
  if (!r.ok) return { error: r.error };
  await setStaffCookie(r.token);
  redirect(r.staff.role === "doctor" ? "/crm/moy-priem" : "/crm/raspisanie");
}

export async function logoutStaffAction(): Promise<void> {
  const { sql } = app();
  await endStaffSession(sql, await readStaffCookie());
  await clearStaffCookie();
  redirect("/crm/vhod");
}

export async function bookingAction(kind: "cash" | "arrived" | "done" | "noshow" | "refund_given", bookingId: number): Promise<R> {
  const s = await requireStaff(["admin", "senior"]);
  const { sql, adapters } = app();
  const input = { bookingId: id(bookingId), adminId: s.id };
  switch (kind) {
    case "cash": return done(await recordCash(sql, adapters.clock, input));
    case "arrived": return done(await markArrived(sql, adapters.clock, input));
    case "done": return done(await staffDone(sql, adapters.clock, input));
    case "noshow": return done(await staffNoShow(sql, adapters.clock, input));
    case "refund_given": return done(await giveManualRefund(sql, adapters.clock, input));
    default: return { ok: false, error: "Неизвестное действие" };
  }
}

export async function cancelAction(bookingId: number, initiator: "patient" | "clinic"): Promise<R> {
  const s = await requireStaff(["admin", "senior"]);
  const { sql, adapters } = app();
  const r = await staffCancel(sql, adapters.clock, { bookingId: id(bookingId), initiator: initiator === "clinic" ? "clinic" : "patient", adminId: s.id });
  return r.ok ? { ok: true, error: null } : { ok: false, error: r.error };
}

export async function moveOptionsAction(bookingId: number): Promise<{ iso: string; label: string }[]> {
  await requireStaff(["admin", "senior"]);
  const { sql, adapters } = app();
  return (await moveOptions(sql, adapters.clock, { bookingId: id(bookingId), count: 4 })).map(o => ({ iso: o.startsAt.toISOString(), label: o.label }));
}

export async function moveAction(bookingId: number, iso: string): Promise<R> {
  const s = await requireStaff(["admin", "senior"]);
  const at = new Date(String(iso));
  if (Number.isNaN(at.getTime())) return { ok: false, error: "Выберите новое время" };
  const { sql, adapters } = app();
  const r = await staffMove(sql, adapters.clock, { bookingId: id(bookingId), startsAt: at, adminId: s.id });
  return r.ok ? { ok: true, error: null } : { ok: false, error: r.error };
}

export async function reconcileAction(incomingId: number, bookingId: number): Promise<R> {
  const s = await requireStaff(["admin", "senior"]);
  const { sql, adapters } = app();
  return done(await reconcile(sql, adapters.clock, { incomingId: id(incomingId), bookingId: id(bookingId), adminId: s.id }));
}

export async function pauseAction(reason: string, comment: string): Promise<R> {
  const s = await requireStaff(["admin", "senior"]);
  const { sql, adapters } = app();
  return done(await pauseOnline(sql, adapters.clock, { adminId: s.id, reason: String(reason).slice(0, 120), comment: String(comment ?? "") }));
}

export async function resumeAction(): Promise<R> {
  const s = await requireStaff(["admin", "senior"]);
  const { sql, adapters } = app();
  return done(await resumeOnline(sql, adapters.clock, { adminId: s.id }));
}

export async function requestDayOffAction(day: string, text: string): Promise<R> {
  const s = await requireStaff(["doctor"]);
  const { sql, adapters } = app();
  return done(await requestDayOff(sql, adapters.clock, { adminId: s.id, day: isoDay(day), text: String(text ?? "") }));
}

export type DayOffRow = { id: number; time: string; patient: string; phone: string; svc: string; paid: boolean; prepay: string; src: string; options: { iso: string; label: string }[] };

/** Записи врача на день для окна «Снятие приёма» и варианты переноса для каждой. */
export async function dayOffDataAction(doctorId: number, day: string): Promise<DayOffRow[]> {
  await requireStaff(["admin", "senior"]);
  const { sql, adapters } = app();
  const d = isoDay(day);
  if (!d) return [];
  const list = (await crmBookings(sql, adapters.clock, { from: d, to: d, doctorId: id(doctorId) }))
    .filter(b => ["held", "pending", "claimed", "confirmed"].includes(b.status));
  const SRC = { site: "Сайт", phone: "Телефон", desk: "Стойка", admin: "Регистратура" } as const;
  const rows: DayOffRow[] = [];
  for (const b of list) {
    const opts = await moveOptions(sql, adapters.clock, { bookingId: b.id, count: 4, avoidDay: d });
    rows.push({ id: b.id, time: `${String(Math.floor(b.startMin / 60)).padStart(2, "0")}:${String(b.startMin % 60).padStart(2, "0")}`,
      patient: b.patient, phone: b.phone, svc: b.service, paid: b.money === "advance", prepay: rub(b.prepayKopecks), src: SRC[b.source],
      options: opts.map(o => ({ iso: o.startsAt.toISOString(), label: `${b.doctorShort} · ${o.label}` })) });
  }
  return rows;
}

export async function closeDayAction(doctorId: number, day: string, reason: string, decisions: { bookingId: number; kind: "refund" | "move"; iso?: string; called: boolean }[]): Promise<R> {
  const s = await requireStaff(["admin", "senior"]);
  const { sql, adapters } = app();
  const clean: DayDecision[] = (Array.isArray(decisions) ? decisions : []).slice(0, 200).map(d => ({
    bookingId: id(d.bookingId), kind: d.kind === "move" ? "move" : "refund", called: d.called === true,
    startsAt: d.kind === "move" && d.iso && !Number.isNaN(new Date(d.iso).getTime()) ? new Date(d.iso) : undefined,
  }));
  return done(await closeDoctorDay(sql, adapters.clock, { adminId: s.id, doctorId: id(doctorId), day: isoDay(day), reason: String(reason).slice(0, 60), decisions: clean }));
}
