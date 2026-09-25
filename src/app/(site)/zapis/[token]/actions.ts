"use server";
import { redirect } from "next/navigation";
import { app } from "@/lib/app";
import { createPayment } from "@/lib/usecases/payment";
import { UsecaseError } from "@/lib/usecases/errors";
import { TOKEN_RE } from "@/lib/params";

/** «Оплатить сейчас» для брони или неоплаченного удержания: платёж и переход в банк. */
export async function payNowAction(token: string, back: string): Promise<void> {
  if (!TOKEN_RE.test(token)) redirect("/");
  const { sql, adapters, config } = app();
  let target = `${back}?oplata=oshibka`;
  try {
    const p = await createPayment(sql, { payment: adapters.payment, clock: adapters.clock }, { token, returnUrl: `${config.siteUrl}/zapis/${token}` });
    target = p.payUrl;
  } catch (e) {
    if (!(e instanceof UsecaseError)) console.error("[оплата] платёж не создан:", e);
  }
  redirect(target);
}
