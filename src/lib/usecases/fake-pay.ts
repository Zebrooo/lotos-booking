// Тестовая оплата для заглушки платежей: строит подписанное уведомление,
// как это сделал бы банк, и проводит его обычным путём. В production
// недоступна: заглушка там запрещена при загрузке адаптеров.
import type { Sql } from "@/lib/db/client";
import type { Clock } from "@/ports/clock";
import type { PaymentProvider } from "@/ports/payment";
import { fakeSignature } from "@/adapters/payment-fake";
import { receiveNotification } from "./receive-notification";

export async function payWithFake(
  sql: Sql, clock: Clock, payment: PaymentProvider, secret: string, externalId: string, status: "paid" | "failed",
): Promise<{ token: string | null; status: number }> {
  const [p] = await sql<{ amountKopecks: number; token: string }[]>`select p.amount_kopecks, b.token
    from payments p join bookings b on b.id = p.booking_id where p.provider = 'fake' and p.external_id = ${externalId}`;
  if (!p) return { token: null, status: 404 };
  const body = { externalId, status, amountKopecks: p.amountKopecks, signature: fakeSignature(secret, externalId, status, p.amountKopecks) };
  const req = new Request("http://internal/api/pay/fake/notify", { method: "POST", body: JSON.stringify(body), headers: { "content-type": "application/json" } });
  const r = await receiveNotification(sql, clock, payment, "fake", req);
  return { token: p.token, status: r.status };
}
