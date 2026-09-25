// Сессия сотрудника в серверных компонентах и действиях CRM. Роль берётся из
// базы при каждом запросе: отключённый сотрудник теряет доступ сразу.
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { app } from "@/lib/app";
import { staffBySession, STAFF_COOKIE, SESSION_HOURS, type Staff, type StaffRole } from "./auth";

export async function currentStaff(): Promise<Staff | null> {
  const token = (await cookies()).get(STAFF_COOKIE)?.value;
  if (!token) return null;
  const { sql, adapters } = app();
  return staffBySession(sql, adapters.clock, token);
}

/** Сотрудник с одной из ролей; иначе — на вход или на свой экран. */
export async function requireStaff(roles?: StaffRole[]): Promise<Staff> {
  const s = await currentStaff();
  if (!s) redirect("/crm/vhod");
  if (roles && !roles.includes(s.role)) redirect(s.role === "doctor" ? "/crm/moy-priem" : "/crm/raspisanie");
  return s;
}

export async function setStaffCookie(token: string): Promise<void> {
  (await cookies()).set(STAFF_COOKIE, token, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/crm", maxAge: SESSION_HOURS * 3600 });
}
export async function readStaffCookie(): Promise<string | undefined> {
  return (await cookies()).get(STAFF_COOKIE)?.value;
}
export async function clearStaffCookie(): Promise<void> {
  (await cookies()).delete({ name: STAFF_COOKIE, path: "/crm" });
}
