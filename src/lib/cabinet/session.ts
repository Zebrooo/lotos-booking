// Сессия личного кабинета пациента: вход по коду из СМС, токен в httpOnly
// cookie, в базе — только его хеш. Кабинет привязан к телефону: в нём видны
// пациенты, записанные на этот номер (сам владелец и его дети).
import { createHash, randomBytes } from "node:crypto";
import type { Db } from "@/lib/db/client";
import type { Clock } from "@/ports/clock";
import { localDay } from "@/domain/time";

export const SESSION_DAYS = 30;
export const SESSION_COOKIE = "lotos_cab";

const sha = (t: string) => createHash("sha256").update(t).digest("hex");

export async function startPatientSession(sql: Db, clock: Clock, phone: string): Promise<string> {
  const token = randomBytes(32).toString("base64url");
  const now = clock.now();
  await sql`insert into patient_sessions (token_hash, phone, created_at, expires_at)
    values (${sha(token)}, ${phone}, ${now}, ${new Date(now.getTime() + SESSION_DAYS * 86400_000)})`;
  await sql`insert into patient_accounts (phone) values (${phone}) on conflict do nothing`;
  return token;
}

export async function phoneBySession(sql: Db, clock: Clock, token: string | undefined): Promise<string | null> {
  if (!token || !/^[A-Za-z0-9_-]{20,100}$/.test(token)) return null;
  const [s] = await sql<{ phone: string }[]>`select phone from patient_sessions where token_hash = ${sha(token)} and expires_at > ${clock.now()}`;
  return s?.phone ?? null;
}

export async function endPatientSession(sql: Db, token: string | undefined): Promise<void> {
  if (token) await sql`delete from patient_sessions where token_hash = ${sha(token)}`;
}

export type CabinetOwner = { id: number; fullName: string; firstName: string; initial: string; birthDate: string; phone: string };

/** Владелец кабинета — взрослый пациент с этим телефоном, старший по возрасту. */
export async function cabinetOwner(sql: Db, clock: Clock, phone: string): Promise<CabinetOwner | null> {
  const adultBorn = `${Number(localDay(clock.now()).slice(0, 4)) - 18}${localDay(clock.now()).slice(4)}`;
  const [p] = await sql<{ id: number; fullName: string; birthDate: string }[]>`select id, full_name, to_char(birth_date, 'YYYY-MM-DD') as birth_date
    from patients where phone = ${phone} and birth_date <= ${adultBorn} order by birth_date limit 1`;
  if (!p) return null;
  const firstName = p.fullName.split(/\s+/)[1] ?? p.fullName;
  return { id: p.id, fullName: p.fullName, firstName, initial: firstName[0] ?? "?", birthDate: p.birthDate, phone };
}
