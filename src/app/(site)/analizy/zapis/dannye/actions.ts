"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { app } from "@/lib/app";
import { startBooking } from "@/lib/usecases/start-booking";
import { requestMeta } from "@/lib/request-meta";
import { clearPrefill } from "@/lib/prefill";
import { parseLabServiceIds } from "@/lib/lab-pool";
import type { StartPayload, StartState } from "@/components/booking/booking-form";

const WHO = new Set(["self", "child", "other"]);
const str = (value: unknown) => typeof value === "string" ? value.slice(0, 200) : "";

export async function startLabBookingAction(serviceIds: number[], startIso: string, payload: StartPayload): Promise<StartState> {
  const ids = parseLabServiceIds(Array.isArray(serviceIds) ? serviceIds.join(",") : "");
  const startsAt = new Date(startIso);
  if (ids.length === 0 || Number.isNaN(startsAt.getTime()) || !WHO.has(payload?.who)) {
    return { errors: { _form: "Не удалось определить состав или время визита. Выберите их заново." } };
  }
  const form = { fio: str(payload.form?.fio), dob: str(payload.form?.dob), phone: str(payload.form?.phone), repFio: str(payload.form?.repFio), phone2: str(payload.form?.phone2) };
  const { sql, adapters, config } = app();
  const result = await startBooking(sql, { sms: adapters.sms, clock: adapters.clock, pepper: process.env.SMS_CODE_PEPPER || "dev-pepper", siteUrl: config.siteUrl }, {
    serviceIds: ids, startsAt, who: payload.who, form, consentPd: payload.consentPd === true, consentPrepay: payload.consentPrepay === true,
    payChoice: payload.payChoice === "reserve" ? "reserve" : "online", ...requestMeta(await headers()),
  });
  if (!result.ok) return { errors: result.errors };
  await clearPrefill();
  redirect(`/zapis/${result.token}/kod`);
}
