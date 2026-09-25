// Коды подтверждения по СМС: запись с сайта и вход в личный кабинет.
// В базе только хеш кода с «перцем» и номером; код живёт 10 минут, на него
// пять попыток, повтор — не раньше чем через минуту, не больше пяти в час.
import { createHash, randomInt, timingSafeEqual } from "node:crypto";
import type { Sql } from "@/lib/db/client";
import type { Clock } from "@/ports/clock";
import type { SmsSender } from "@/ports/sms";

export const CODE_TTL_MINUTES = 10;
export const RESEND_SECONDS = 60;
export const MAX_ATTEMPTS = 5;
export const MAX_PER_HOUR = 5;

export type CodePurpose = "booking" | "login";

const hash = (pepper: string, phone: string, code: string) =>
  createHash("sha256").update(`${pepper}:${phone}:${code}`).digest("hex");

export const randomCode = () => String(randomInt(0, 10_000)).padStart(4, "0");

export type IssueResult =
  | { ok: true; resendAt: Date }
  | { ok: false; reason: "cooldown"; retryAt: Date }
  | { ok: false; reason: "too_many" | "send_failed" };

export async function issueCode(
  sql: Sql,
  deps: { sms: SmsSender; clock: Clock; pepper: string; genCode?: () => string },
  input: { phone: string; purpose: CodePurpose; bookingId?: number | null; text: (code: string) => string },
): Promise<IssueResult> {
  const now = deps.clock.now();
  const recent = await sql<{ createdAt: Date }[]>`select created_at from sms_codes
    where phone = ${input.phone} and purpose = ${input.purpose} and created_at > ${new Date(now.getTime() - 3600_000)}
    order by created_at desc`;
  const last = recent[0];
  if (last && now.getTime() - last.createdAt.getTime() < RESEND_SECONDS * 1000) {
    return { ok: false, reason: "cooldown", retryAt: new Date(last.createdAt.getTime() + RESEND_SECONDS * 1000) };
  }
  if (recent.length >= MAX_PER_HOUR) return { ok: false, reason: "too_many" };
  const code = (deps.genCode ?? randomCode)();
  const sent = await deps.sms.send(input.phone, input.text(code));
  if (!sent.ok) return { ok: false, reason: "send_failed" };
  await sql`insert into sms_codes (phone, purpose, booking_id, code_hash, expires_at, created_at)
    values (${input.phone}, ${input.purpose}, ${input.bookingId ?? null}, ${hash(deps.pepper, input.phone, code)},
      ${new Date(now.getTime() + CODE_TTL_MINUTES * 60_000)}, ${now})`;
  return { ok: true, resendAt: new Date(now.getTime() + RESEND_SECONDS * 1000) };
}

export type VerifyResult = { ok: true } | { ok: false; reason: "none" | "invalid" | "expired" | "too_many" };

export async function verifyCode(
  sql: Sql, clock: Clock, input: { phone: string; purpose: CodePurpose; code: string; pepper: string },
): Promise<VerifyResult> {
  const now = clock.now();
  return sql.begin(async tx => {
    const [c] = await tx<{ id: number; codeHash: string; attempts: number; expiresAt: Date }[]>`
      select id, code_hash, attempts, expires_at from sms_codes
      where phone = ${input.phone} and purpose = ${input.purpose} and used_at is null
      order by created_at desc limit 1 for update`;
    if (!c) return { ok: false, reason: "none" } as const;
    if (c.attempts >= MAX_ATTEMPTS) return { ok: false, reason: "too_many" } as const;
    if (c.expiresAt <= now) return { ok: false, reason: "expired" } as const;
    const expected = Buffer.from(c.codeHash);
    const got = Buffer.from(hash(input.pepper, input.phone, input.code));
    if (expected.length === got.length && timingSafeEqual(expected, got)) {
      await tx`update sms_codes set used_at = ${now} where id = ${c.id}`;
      return { ok: true } as const;
    }
    const attempts = c.attempts + 1;
    await tx`update sms_codes set attempts = ${attempts} where id = ${c.id}`;
    return { ok: false, reason: attempts >= MAX_ATTEMPTS ? "too_many" : "invalid" } as const;
  });
}
