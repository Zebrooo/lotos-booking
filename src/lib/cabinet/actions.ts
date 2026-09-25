// Действия личного кабинета: вход по коду, профиль, отметки и заявки.
// Каждое действие проверяет, что данные принадлежат телефону из сессии.
import type { Sql, Db } from "@/lib/db/client";
import type { Clock } from "@/ports/clock";
import type { SmsSender } from "@/ports/sms";
import { phoneE164 } from "@/lib/forms/booking-v2";
import { issueCode, verifyCode } from "@/lib/usecases/sms-codes";
import { startPatientSession } from "./session";

type Deps = { sms: SmsSender; clock: Clock; pepper: string; genCode?: () => string };

/** Номер известен, если на него записан пациент или с него записывали. */
async function knownPhone(sql: Db, phone: string): Promise<boolean> {
  const [r] = await sql`select 1 from patients where phone = ${phone}
    union all select 1 from bookings where booker_phone = ${phone} limit 1`;
  return !!r;
}

export async function requestLoginCode(sql: Sql, deps: Deps, masked: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const digits = masked.replace(/\D/g, "");
  if (digits.length < 11) return { ok: false, error: "Введите номер полностью: +7 и 10 цифр" };
  const phone = phoneE164(masked);
  // Одинаковый ответ для известного и неизвестного номера: по форме входа
  // нельзя выяснить, лечится ли человек в клинике.
  if (!(await knownPhone(sql, phone))) return { ok: true };
  const r = await issueCode(sql, deps, { phone, purpose: "login", text: code => `Лотос: код для входа в личный кабинет — ${code}. Никому его не сообщайте.` });
  if (r.ok) return { ok: true };
  if (r.reason === "cooldown") return { ok: false, error: `Код уже отправлен. Повторно — через ${Math.ceil((r.retryAt.getTime() - deps.clock.now().getTime()) / 1000)} с` };
  return { ok: false, error: r.reason === "too_many" ? "Слишком много кодов за час. Попробуйте позже" : "Не удалось отправить СМС" };
}

export async function loginWithCode(sql: Sql, deps: Deps, masked: string, code: string): Promise<{ ok: true; sessionToken: string } | { ok: false; error: string }> {
  const phone = phoneE164(masked);
  const v = await verifyCode(sql, deps.clock, { phone, purpose: "login", code: code.replace(/\D/g, ""), pepper: deps.pepper });
  if (!v.ok) return { ok: false, error: v.reason === "too_many" ? "Слишком много попыток — запросите новый код" : v.reason === "invalid" ? "Неверный код. Проверьте цифры из СМС" : "Код устарел — запросите новый" };
  return { ok: true, sessionToken: await startPatientSession(sql, deps.clock, phone) };
}

export async function updateAccount(sql: Db, phone: string, patch: { email?: string; notifyRemind?: boolean; notifyResults?: boolean; notifyEmail?: boolean }): Promise<{ ok: true } | { ok: false; error: string }> {
  let email: string | null | undefined;
  if (patch.email !== undefined) {
    const e = patch.email.trim().toLowerCase();
    if (e && (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e) || e.length > 200)) return { ok: false, error: "Проверьте адрес почты" };
    email = e || null;
  }
  await sql`insert into patient_accounts (phone) values (${phone}) on conflict do nothing`;
  await sql`update patient_accounts set
    email = ${email === undefined ? sql`email` : email},
    notify_remind = ${patch.notifyRemind === undefined ? sql`notify_remind` : patch.notifyRemind},
    notify_results = ${patch.notifyResults === undefined ? sql`notify_results` : patch.notifyResults},
    notify_email = ${patch.notifyEmail === undefined ? sql`notify_email` : patch.notifyEmail}
    where phone = ${phone}`;
  return { ok: true };
}

export async function markDocumentRead(sql: Db, phone: string, documentId: number): Promise<boolean> {
  const [d] = await sql`select 1 from medical_documents d join patients p on p.id = d.patient_id where d.id = ${documentId} and p.phone = ${phone}`;
  if (!d) return false;
  await sql`insert into document_reads (document_id, phone) values (${documentId}, ${phone}) on conflict do nothing`;
  return true;
}

export async function requestFromCabinet(sql: Db, clock: Clock, phone: string, kind: "tax" | "child"): Promise<boolean> {
  await sql`insert into cabinet_requests (phone, kind, payload, created_at) values (${phone}, ${kind}, ${sql.json({ year: clock.now().getUTCFullYear() })}, ${clock.now()})`;
  return true;
}

/** Запись пациента с этим телефоном (сам или записанный им ребёнок); чужая — null. */
export async function bookingOfPhone(sql: Db, phone: string, bookingId: number): Promise<{ id: number; token: string } | null> {
  const [b] = await sql<{ id: number; token: string }[]>`select b.id, b.token from bookings b join patients p on p.id = b.patient_id
    where b.id = ${bookingId} and (p.phone = ${phone} or b.booker_phone = ${phone})`;
  return b ?? null;
}
