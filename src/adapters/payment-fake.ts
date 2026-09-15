// src/adapters/payment-fake.ts
// Заглушка платежей для разработки и тестов: ссылка ведёт на dev-страницу,
// которая сама шлёт подписанное уведомление в /api/pay/fake/notify.
import { createHmac, timingSafeEqual } from "node:crypto";
import type { PaymentProvider, PaymentRequest, ParsedNotification } from "@/ports/payment";

export type FakePaymentOptions = { baseUrl: string; secret: string };

export function fakeSignature(secret: string, externalId: string, status: string, amountKopecks: number): string {
  return createHmac("sha256", secret).update(`${externalId}|${status}|${amountKopecks}`).digest("hex");
}

export function createFakePaymentProvider(o: FakePaymentOptions): PaymentProvider {
  return {
    name: "fake",
    async createPayment(req: PaymentRequest) {
      const externalId = `fake-${req.paymentId}`;
      const payUrl = `${o.baseUrl}/dev/oplata/${externalId}?amount=${req.amountKopecks}&return=${encodeURIComponent(req.returnUrl)}`;
      return { externalId, payUrl };
    },
    async parseNotification(req: Request): Promise<ParsedNotification> {
      let body: unknown;
      try { body = await req.json(); } catch { return { invalid: "тело не JSON" }; }
      const b = body as { externalId?: unknown; status?: unknown; amountKopecks?: unknown; signature?: unknown };
      if (typeof b.externalId !== "string" || (b.status !== "paid" && b.status !== "failed")
        || typeof b.amountKopecks !== "number" || !Number.isInteger(b.amountKopecks) || typeof b.signature !== "string") {
        return { invalid: "неполное уведомление" };
      }
      const expected = Buffer.from(fakeSignature(o.secret, b.externalId, b.status, b.amountKopecks));
      const got = Buffer.from(b.signature);
      if (expected.length !== got.length || !timingSafeEqual(expected, got)) return { invalid: "подпись не сошлась" };
      return { externalId: b.externalId, status: b.status, amountKopecks: b.amountKopecks, raw: body };
    },
    async status() { return "pending"; },
    async refund(externalId) { return { ok: true, refundId: `refund-${externalId}` }; },
  };
}
