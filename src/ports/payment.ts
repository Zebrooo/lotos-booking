// src/ports/payment.ts
export type PaymentRequest = { paymentId: number; amountKopecks: number; description: string; returnUrl: string; email: string };
export type PaymentCreated = { externalId: string; payUrl: string };
export type PaymentNotification = { externalId: string; status: "paid" | "failed"; amountKopecks: number; raw: unknown };
export type ParsedNotification = PaymentNotification | { invalid: string };
export type RefundResult = { ok: true; refundId: string } | { ok: false; error: string };

export interface PaymentProvider {
  readonly name: string;
  createPayment(req: PaymentRequest): Promise<PaymentCreated>;
  /** Разбор и проверка подписи входящего уведомления. Не трогает базу. */
  parseNotification(req: Request): Promise<ParsedNotification>;
  status(externalId: string): Promise<"paid" | "pending" | "failed">;
  refund(externalId: string, amountKopecks: number): Promise<RefundResult>;
}
