"use server";
import { redirect } from "next/navigation";
import { app } from "@/lib/app";
import { confirmBookingCode, resendBookingCode } from "@/lib/usecases/start-booking";
import { createPayment } from "@/lib/usecases/payment";
import { abandonHold, codeStep } from "@/lib/usecases/code-step";
import { setSessionCookie } from "@/lib/cabinet/cookie";
import { savePrefill } from "@/lib/prefill";
import { TOKEN_RE } from "@/lib/params";

const deps = () => {
  const { sql, adapters, config } = app();
  return { sql, adapters, config, start: { sms: adapters.sms, clock: adapters.clock, pepper: process.env.SMS_CODE_PEPPER || "dev-pepper", siteUrl: config.siteUrl } };
};

export async function confirmCodeAction(token: string, code: string): Promise<{ error: string }> {
  if (!TOKEN_RE.test(token)) redirect("/");
  const { sql, adapters, config, start } = deps();
  const r = await confirmBookingCode(sql, start, { token, code: String(code).slice(0, 8) });
  if (!r.ok) return { error: r.error };
  await setSessionCookie(r.sessionToken);
  let target = `/zapis/${token}`;
  if (r.next === "pay") {
    try {
      const p = await createPayment(sql, { payment: adapters.payment, clock: adapters.clock }, { token, returnUrl: `${config.siteUrl}/zapis/${token}` });
      target = p.payUrl;
    } catch (e) {
      console.error("[оплата] платёж не создан после кода:", e);
    }
  }
  redirect(target);
}

export async function resendCodeAction(token: string): Promise<{ error: string | null; resendAt: string | null }> {
  if (!TOKEN_RE.test(token)) redirect("/");
  const { sql, start } = deps();
  const r = await resendBookingCode(sql, start, token);
  if (!r.ok) return { error: r.error, resendAt: null };
  const step = await codeStep(sql, start.clock, token);
  return { error: null, resendAt: step?.resendAt.toISOString() ?? null };
}

export async function changeNumberAction(token: string): Promise<void> {
  if (!TOKEN_RE.test(token)) redirect("/");
  const { sql, adapters } = deps();
  const step = await codeStep(sql, adapters.clock, token);
  if (!step) redirect("/");
  await abandonHold(sql, token);
  await savePrefill(step.prefill);
  redirect(`/vrach/${step.doctorId}/dannye?svc=${step.serviceId}&start=${encodeURIComponent(step.startsAt.toISOString())}`);
}
