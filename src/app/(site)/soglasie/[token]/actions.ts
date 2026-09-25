"use server";
import { headers } from "next/headers";
import { app } from "@/lib/app";
import { token as tokenParam } from "@/lib/params";
import { requestMeta } from "@/lib/request-meta";
import { givePatientConsent } from "@/lib/usecases/patient-consent";

export async function giveConsentAction(token: string, agreed: boolean): Promise<{ ok: boolean; error: string | null }> {
  if (!agreed) return { ok: false, error: "Отметьте согласие — без него записаться нельзя" };
  const t = tokenParam(token);
  if (!t) return { ok: false, error: "Ссылка недействительна" };
  const { sql, adapters } = app();
  const r = await givePatientConsent(sql, adapters.clock, { token: t, ...requestMeta(await headers()) });
  return r.ok ? { ok: true, error: null } : { ok: false, error: r.error };
}
