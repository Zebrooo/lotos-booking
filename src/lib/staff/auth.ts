// Вход сотрудников в CRM: почта и пароль (argon2), сессия на смену в httpOnly
// cookie, в базе — только хеш токена. Подбор пароля останавливает блокировка
// после пяти неудач подряд. Ошибка одна и та же для неизвестной почты и
// неверного пароля, чтобы по ответу нельзя было узнать, кто работает в клинике.
import { createHash, randomBytes } from "node:crypto";
import { hash, verify } from "@node-rs/argon2";
import type { Db } from "@/lib/db/client";
import type { Clock } from "@/ports/clock";

export type StaffRole = "admin" | "senior" | "doctor";
export type Staff = { id: number; email: string; role: StaffRole; fullName: string; resourceId: number | null };

export const STAFF_COOKIE = "lotos_staff";
export const SESSION_HOURS = 12;
export const MAX_FAILS = 5;
export const LOCK_MINUTES = 15;
const WRONG = "Неверная почта или пароль";

const sha = (t: string) => createHash("sha256").update(t).digest("hex");
// Хеш-приманка: проверяем пароль и для неизвестной почты, чтобы время ответа не выдавало её.
let decoy: Promise<string> | null = null;
const decoyHash = () => (decoy ??= hash("lotos-decoy-password"));

export async function staffLogin(sql: Db, clock: Clock, input: { email: string; password: string }): Promise<{ ok: true; token: string; staff: Staff } | { ok: false; error: string }> {
  const now = clock.now();
  const email = input.email.trim().toLowerCase().slice(0, 200);
  const password = input.password.slice(0, 200);
  const [a] = await sql<{ id: number; passwordHash: string; role: StaffRole; fullName: string | null; resourceId: number | null; failedLogins: number; lockedUntil: Date | null }[]>`
    select id, password_hash, role, full_name, resource_id, failed_logins, locked_until from admins where email = ${email} and active`;
  if (!a) {
    await verify(await decoyHash(), password).catch(() => false);
    return { ok: false, error: WRONG };
  }
  if (a.lockedUntil && a.lockedUntil > now) return { ok: false, error: `Слишком много попыток. Попробуйте через ${LOCK_MINUTES} минут` };
  const good = await verify(a.passwordHash, password).catch(() => false);
  if (!good) {
    const fails = a.failedLogins + 1;
    if (fails >= MAX_FAILS) await sql`update admins set failed_logins = 0, locked_until = ${new Date(now.getTime() + LOCK_MINUTES * 60_000)} where id = ${a.id}`;
    else await sql`update admins set failed_logins = ${fails} where id = ${a.id}`;
    return { ok: false, error: WRONG };
  }
  await sql`update admins set failed_logins = 0, locked_until = null where id = ${a.id}`;
  const token = randomBytes(32).toString("base64url");
  await sql`insert into staff_sessions (token_hash, admin_id, created_at, expires_at)
    values (${sha(token)}, ${a.id}, ${now}, ${new Date(now.getTime() + SESSION_HOURS * 3600_000)})`;
  return { ok: true, token, staff: { id: a.id, email, role: a.role, fullName: a.fullName ?? email, resourceId: a.resourceId } };
}

export async function staffBySession(sql: Db, clock: Clock, token: string | undefined): Promise<Staff | null> {
  if (!token || !/^[A-Za-z0-9_-]{20,100}$/.test(token)) return null;
  const [s] = await sql<{ id: number; email: string; role: StaffRole; fullName: string | null; resourceId: number | null }[]>`
    select a.id, a.email, a.role, a.full_name, a.resource_id from staff_sessions s join admins a on a.id = s.admin_id
    where s.token_hash = ${sha(token)} and s.expires_at > ${clock.now()} and a.active`;
  return s ? { ...s, fullName: s.fullName ?? s.email } : null;
}

export async function endStaffSession(sql: Db, token: string | undefined): Promise<void> {
  if (token) await sql`delete from staff_sessions where token_hash = ${sha(token)}`;
}
