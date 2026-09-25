import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { testDb, truncateAll, seedClinic } from "./helpers";
import type { Sql } from "@/lib/db/client";
import type { Notifier } from "@/ports/notify";
import { holdSlot } from "@/lib/usecases/hold";
import { createPayment, applyPaymentNotification } from "@/lib/usecases/payment";
import { runOnce, RUNNER_LOCK_KEY, type RunnerDeps } from "@/lib/jobs/runner";
import { createFakePaymentProvider } from "@/adapters/payment-fake";
import { logFiscalizer } from "@/adapters/fiscal-log";
import { localTime } from "@/domain/time";

let sql: Sql;
beforeAll(() => { sql = testDb(); });
afterAll(async () => { await sql.end(); });
beforeEach(async () => { await truncateAll(sql); });

const clock = { now: () => new Date("2026-09-14T06:00:00Z") };
const fake = createFakePaymentProvider({ baseUrl: "http://localhost:3000", secret: "s" });
const quiet: Notifier = { name: "quiet", sendEmail: async () => ({ ok: true, messageId: "m" }) };
const mail = { siteUrl: "http://localhost:3000", clinic: { name: "Лотос", address: "Челябинск", phone: "+7 351 000-00-00" } };
const sms = { name: "quiet", send: async () => ({ ok: true as const, messageId: "s" }) };
const deps = (over: Partial<RunnerDeps> = {}): RunnerDeps => ({ sql, clock, payment: fake, fiscal: logFiscalizer, notify: quiet, sms, mail, ...over });

async function paidBooking() {
  const s = await seedClinic(sql);
  const h = await holdSlot(sql, clock, { serviceId: s.consultId, doctorId: s.doctorId, startsAt: localTime("2026-09-17", 600),
    patient: { fullName: "Иванов Иван Иванович", birthDate: "1980-01-01", phone: "+79000000001", email: "ivanov@example.com" }, consentIds: s.consentIds });
  const { paymentId } = await createPayment(sql, { payment: fake, clock }, { token: h.token, returnUrl: "http://x/r" });
  await applyPaymentNotification(sql, clock, { provider: "fake", notification: { externalId: `fake-${paymentId}`, status: "paid", amountKopecks: 40000, raw: {} } });
}

describe("runOnce", () => {
  it("проходит все очереди и говорит, сколько сделал", async () => {
    await paidBooking();
    expect(await runOnce(deps())).toEqual({ expired: 0, polled: 0, refunds: 0, receipts: 1, reminders: 0, notifications: 1, errors: 0 });
  });

  it("при занятой блокировке ничего не делает", async () => {
    await paidBooking();
    const other = await sql.reserve();
    try {
      await other`select pg_advisory_lock(${RUNNER_LOCK_KEY})`;
      expect(await runOnce(deps())).toEqual({ skipped: 1 });
      await other`select pg_advisory_unlock(${RUNNER_LOCK_KEY})`;
    } finally {
      other.release();
    }
    expect(await runOnce(deps())).toMatchObject({ receipts: 1 });
  });

  it("исключение в одном проходе не мешает остальным", async () => {
    await paidBooking();
    const throwing = { name: "boom", send: async () => { throw new Error("касса упала"); } };
    const r = await runOnce(deps({ fiscal: throwing, log: () => {} }));
    expect(r).toMatchObject({ errors: 1, notifications: 1 });
  });
});
