import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { testDb, truncateAll } from "./helpers";
import type { Sql } from "@/lib/db/client";
import type { SmsSender } from "@/ports/sms";
import { issueCode, verifyCode, CODE_TTL_MINUTES, RESEND_SECONDS } from "@/lib/usecases/sms-codes";

let sql: Sql;
beforeAll(() => { sql = testDb(); });
afterAll(async () => { await sql.end(); });
beforeEach(async () => { await truncateAll(sql); });

const phone = "+79001234567";
const t0 = new Date("2026-09-24T09:20:00Z");
const at = (sec: number) => ({ now: () => new Date(t0.getTime() + sec * 1000) });
function capture(): SmsSender & { sent: { phone: string; text: string }[] } {
  const sent: { phone: string; text: string }[] = [];
  return { name: "capture", sent, send: async (p, text) => { sent.push({ phone: p, text }); return { ok: true, messageId: "1" }; } };
}
const deps = (sms: SmsSender, sec = 0) => ({ sms, clock: at(sec), genCode: () => "2604", pepper: "test" });

describe("коды СМС", () => {
  it("код уходит в СМС, в базе только хеш; верный код подтверждает один раз", async () => {
    const sms = capture();
    const r = await issueCode(sql, deps(sms), { phone, purpose: "login", text: code => `Лотос: код ${code}` });
    expect(r).toEqual({ ok: true, resendAt: new Date(t0.getTime() + RESEND_SECONDS * 1000) });
    expect(sms.sent).toEqual([{ phone, text: "Лотос: код 2604" }]);
    const [row] = await sql<{ codeHash: string }[]>`select code_hash from sms_codes`;
    expect(row!.codeHash).not.toContain("2604");
    expect(await verifyCode(sql, at(30), { phone, purpose: "login", code: "2604", pepper: "test" })).toEqual({ ok: true });
    expect(await verifyCode(sql, at(31), { phone, purpose: "login", code: "2604", pepper: "test" })).toEqual({ ok: false, reason: "none" });
  });

  it("повтор не раньше чем через минуту", async () => {
    const sms = capture();
    await issueCode(sql, deps(sms), { phone, purpose: "login", text: c => c });
    expect(await issueCode(sql, deps(sms, 30), { phone, purpose: "login", text: c => c }))
      .toEqual({ ok: false, reason: "cooldown", retryAt: new Date(t0.getTime() + RESEND_SECONDS * 1000) });
    expect((await issueCode(sql, deps(sms, 61), { phone, purpose: "login", text: c => c })).ok).toBe(true);
    expect(sms.sent).toHaveLength(2);
  });

  it("не больше пяти кодов в час на номер", async () => {
    const sms = capture();
    for (let i = 0; i < 5; i++) expect((await issueCode(sql, deps(sms, i * 61), { phone, purpose: "login", text: c => c })).ok).toBe(true);
    expect(await issueCode(sql, deps(sms, 5 * 61), { phone, purpose: "login", text: c => c })).toMatchObject({ ok: false, reason: "too_many" });
  });

  it("неверный код: пять попыток, потом код сгорает; просроченный не принимается", async () => {
    const sms = capture();
    await issueCode(sql, deps(sms), { phone, purpose: "booking", bookingId: null, text: c => c });
    for (let i = 0; i < 4; i++) expect(await verifyCode(sql, at(10), { phone, purpose: "booking", code: "0000", pepper: "test" })).toEqual({ ok: false, reason: "invalid" });
    expect(await verifyCode(sql, at(10), { phone, purpose: "booking", code: "0000", pepper: "test" })).toEqual({ ok: false, reason: "too_many" });
    expect(await verifyCode(sql, at(11), { phone, purpose: "booking", code: "2604", pepper: "test" })).toEqual({ ok: false, reason: "too_many" });
    await truncateAll(sql);
    await issueCode(sql, deps(sms), { phone, purpose: "booking", text: c => c });
    expect(await verifyCode(sql, at(CODE_TTL_MINUTES * 60 + 1), { phone, purpose: "booking", code: "2604", pepper: "test" })).toEqual({ ok: false, reason: "expired" });
  });

  it("коды разных назначений не смешиваются; СМС не ушло — ошибка", async () => {
    await issueCode(sql, deps(capture()), { phone, purpose: "login", text: c => c });
    expect(await verifyCode(sql, at(5), { phone, purpose: "booking", code: "2604", pepper: "test" })).toEqual({ ok: false, reason: "none" });
    const broken: SmsSender = { name: "broken", send: async () => ({ ok: false, error: "шлюз недоступен" }) };
    await truncateAll(sql);
    expect(await issueCode(sql, deps(broken), { phone, purpose: "login", text: c => c })).toEqual({ ok: false, reason: "send_failed" });
  });
});
