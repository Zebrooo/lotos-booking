// Уведомление провайдера об оплате: POST /api/pay/<провайдер>/notify.
import { app } from "@/lib/app";
import { receiveNotification } from "@/lib/usecases/receive-notification";

export async function POST(req: Request, ctx: RouteContext<"/api/pay/[provider]/notify">) {
  const { provider } = await ctx.params;
  const { sql, adapters } = app();
  const r = await receiveNotification(sql, adapters.clock, adapters.payment, provider, req);
  return new Response(r.body, { status: r.status, headers: { "content-type": "text/plain; charset=utf-8" } });
}
