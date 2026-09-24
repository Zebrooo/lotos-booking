import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { testDb, truncateAll, seedClinic } from "./helpers";
import type { Sql } from "@/lib/db/client";
import { holdSlot } from "@/lib/usecases/hold";
import { createPayment } from "@/lib/usecases/payment";
import { receiveNotification } from "@/lib/usecases/receive-notification";
import { createFakePaymentProvider, fakeSignature } from "@/adapters/payment-fake";
import { localTime } from "@/domain/time";

let sql: Sql;
beforeAll(() => { sql = testDb(); });
afterAll(async () => { await sql.end(); });
beforeEach(async () => { await truncateAll(sql); });

const clock = { now: () => new Date("2026-09-14T06:00:00Z") };
const fake = createFakePaymentProvider({ baseUrl: "http://localhost:3000", secret: "s" });
const post = (body: unknown) => new Request("http://localhost:3000/api/pay/fake/notify", { method: "POST", body: JSON.stringify(body), headers: { "content-type": "application/json" } });
const signed = (externalId: string, amountKopecks = 40000, status = "paid") =>
  post({ externalId, status, amountKopecks, signature: fakeSignature("s", externalId, status, amountKopecks) });

async function pendingPayment() {
  const s = await seedClinic(sql);
  const h = await holdSlot(sql, clock, { serviceId: s.consultId, doctorId: s.doctorId, startsAt: localTime("2026-09-17", 600),
    patient: { fullName: "Иванов Иван Иванович", birthDate: "1980-01-01", phone: "+79000000001", email: "ivanov@example.com" }, consentIds: s.consentIds });
  const { paymentId } = await createPayment(sql, { payment: fake, clock }, { token: h.token, returnUrl: "http://x/r" });
  return { h, externalId: `fake-${paymentId}` };
}

describe("receiveNotification", () => {
  it("подписанное уведомление подтверждает запись; повтор тоже 200", async () => {
    const { h, externalId } = await pendingPayment();
    expect(await receiveNotification(sql, clock, fake, "fake", signed(externalId))).toEqual({ status: 200, body: "confirmed" });
    expect(await receiveNotification(sql, clock, fake, "fake", signed(externalId))).toEqual({ status: 200, body: "already" });
    const [b] = await sql<{ status: string }[]>`select status from bookings where id = ${h.bookingId}`;
    expect(b!.status).toBe("confirmed");
  });

  it("чужой провайдер — 404, неверная подпись — 403, неизвестный платёж — 404, сумма — 400", async () => {
    const { externalId } = await pendingPayment();
    expect((await receiveNotification(sql, clock, fake, "sber", signed(externalId))).status).toBe(404);
    const forged = post({ externalId, status: "paid", amountKopecks: 40000, signature: "0".repeat(64) });
    expect((await receiveNotification(sql, clock, fake, "fake", forged)).status).toBe(403);
    expect((await receiveNotification(sql, clock, fake, "fake", signed("fake-999999"))).status).toBe(404);
    expect((await receiveNotification(sql, clock, fake, "fake", signed(externalId, 100))).status).toBe(400);
    const [p] = await sql<{ status: string }[]>`select status from payments`;
    expect(p!.status).toBe("created");
  });
});
