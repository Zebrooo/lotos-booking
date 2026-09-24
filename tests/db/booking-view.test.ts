import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { testDb, truncateAll, seedClinic } from "./helpers";
import type { Sql } from "@/lib/db/client";
import { holdSlot } from "@/lib/usecases/hold";
import { createPayment, applyPaymentNotification } from "@/lib/usecases/payment";
import { cancelBooking } from "@/lib/usecases/cancel";
import { transferBooking } from "@/lib/usecases/transfer";
import { getBookingView } from "@/lib/queries/booking-view";
import { createFakePaymentProvider } from "@/adapters/payment-fake";
import { localTime } from "@/domain/time";

let sql: Sql;
beforeAll(() => { sql = testDb(); });
afterAll(async () => { await sql.end(); });
beforeEach(async () => { await truncateAll(sql); });

const payment = createFakePaymentProvider({ baseUrl: "http://localhost:3000", secret: "s" });
const patient = { fullName: "Иванов Иван Иванович", birthDate: "1980-01-01", phone: "+79000000001", email: "ivanov@example.com" };
const at = (iso: string) => ({ now: () => new Date(iso) });
const START = localTime("2026-09-17", 600); // чт 10:00 местного

async function held() {
  const s = await seedClinic(sql);
  const h = await holdSlot(sql, at("2026-09-14T06:00:00Z"), { serviceId: s.consultId, doctorId: s.doctorId, startsAt: START, patient, consentIds: s.consentIds });
  return { s, h };
}
async function paid() {
  const r = await held();
  const clock = at("2026-09-14T06:00:00Z");
  const { paymentId } = await createPayment(sql, { payment, clock }, { token: r.h.token, returnUrl: "http://x/r" });
  await applyPaymentNotification(sql, clock, { provider: "fake", notification: { externalId: `fake-${paymentId}`, status: "paid", amountKopecks: 40000, raw: {} } });
  return r;
}

describe("getBookingView", () => {
  it("удержание: можно оплатить и отменить, переносить нельзя, почта маскирована", async () => {
    const { s, h } = await held();
    const v = await getBookingView(sql, at("2026-09-14T06:05:00Z"), h.token);
    expect(v).toMatchObject({
      token: h.token, status: "held", statusLabel: "Ждёт оплаты", serviceId: s.consultId, doctorId: s.doctorId,
      service: { title: "Консультация кардиолога", durationMin: 30 }, doctor: { title: "Жаворонкова А. А.", specialty: "кардиолог" },
      money: "unpaid", prepayKopecks: 40000, canPay: true, canCancel: true, canTransfer: false,
      cancelPreview: { kind: "none", reason: "not_paid" }, patientName: "Иванов Иван Иванович", emailMasked: "i***@example.com",
    });
    expect(v!.startsAt.toISOString()).toBe(START.toISOString());
    expect(v!.holdUntil?.toISOString()).toBe("2026-09-14T06:15:00.000Z");
  });

  it("удержание истекло по часам — оплатить уже нельзя", async () => {
    const { h } = await held();
    const v = await getBookingView(sql, at("2026-09-14T06:16:00Z"), h.token);
    expect(v).toMatchObject({ status: "held", canPay: false });
  });

  it("оплачено: до порога возврат и перенос, после порога удержание и без переноса", async () => {
    const { h } = await paid();
    const before = await getBookingView(sql, at("2026-09-15T05:00:00Z"), h.token);
    expect(before).toMatchObject({ status: "confirmed", money: "advance_held", canPay: false, canCancel: true, canTransfer: true,
      cancelPreview: { kind: "refund", reason: "before_threshold" }, freeCancelHours: 24 });
    const after = await getBookingView(sql, at("2026-09-16T20:00:00Z"), h.token);
    expect(after).toMatchObject({ canCancel: true, canTransfer: false, cancelPreview: { kind: "retain", reason: "after_threshold" } });
  });

  it("отменённая запись: ничего нельзя; неизвестный токен — null", async () => {
    const { h } = await paid();
    await cancelBooking(sql, at("2026-09-15T05:00:00Z"), { token: h.token, actor: "patient" });
    const v = await getBookingView(sql, at("2026-09-15T05:01:00Z"), h.token);
    expect(v).toMatchObject({ status: "cancelled", canPay: false, canCancel: false, canTransfer: false, refundPending: true });
    expect(await getBookingView(sql, at("2026-09-15T05:01:00Z"), "нет-такого-токена")).toBeNull();
  });

  it("перенесённая запись ведёт на новую", async () => {
    const { s, h } = await paid();
    const t = await transferBooking(sql, at("2026-09-15T05:00:00Z"), { token: h.token, actor: "patient", doctorId: s.doctorId, startsAt: localTime("2026-09-18", 900) });
    const v = await getBookingView(sql, at("2026-09-15T05:01:00Z"), h.token);
    expect(v).toMatchObject({ status: "transferred", transferredToToken: t.newToken, canCancel: false });
    const fresh = await getBookingView(sql, at("2026-09-15T05:01:00Z"), t.newToken);
    expect(fresh).toMatchObject({ status: "confirmed", transferredToToken: null, money: "advance_held" });
  });
});
