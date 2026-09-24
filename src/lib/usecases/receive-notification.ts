// Входящее уведомление провайдера об оплате. Коды ответа важны: на всё,
// кроме 2xx, провайдер обычно повторяет попытку, поэтому 200 отдаётся и на
// повтор, а неисправимое (чужая подпись, неизвестный платёж) — сразу 4xx.
import type { Sql } from "@/lib/db/client";
import type { Clock } from "@/ports/clock";
import type { PaymentProvider } from "@/ports/payment";
import { applyPaymentNotification } from "./payment";

export async function receiveNotification(
  sql: Sql, clock: Clock, payment: PaymentProvider, providerName: string, req: Request,
): Promise<{ status: number; body: string }> {
  if (providerName !== payment.name) return { status: 404, body: "unknown provider" };
  const parsed = await payment.parseNotification(req);
  if ("invalid" in parsed) {
    console.warn(`[оплата] отклонено уведомление ${providerName}: ${parsed.invalid}`);
    return { status: 403, body: "invalid notification" };
  }
  const { outcome } = await applyPaymentNotification(sql, clock, { provider: providerName, notification: parsed });
  switch (outcome) {
    case "unknown":
      return { status: 404, body: "unknown payment" };
    case "amount_mismatch":
      console.error(`[оплата] сумма не сошлась: ${providerName} ${parsed.externalId} ${parsed.amountKopecks}`);
      return { status: 400, body: "amount mismatch" };
    default:
      return { status: 200, body: outcome };
  }
}
