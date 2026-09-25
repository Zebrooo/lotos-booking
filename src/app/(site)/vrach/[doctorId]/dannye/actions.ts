"use server";
// Отправка формы записи: проверка, удержание окна и код по СМС. Всё, что
// пришло из браузера, заново проверяет сценарий startBooking.
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { app } from "@/lib/app";
import { startBooking } from "@/lib/usecases/start-booking";
import { requestMeta } from "@/lib/request-meta";
import { clearPrefill } from "@/lib/prefill";
import type { StartPayload, StartState } from "@/components/booking/booking-form";

const WHO = new Set(["self", "child", "other"]);
const str = (v: unknown) => (typeof v === "string" ? v.slice(0, 200) : "");

export async function startBookingAction(serviceId: number, doctorId: number, startIso: string, p: StartPayload): Promise<StartState> {
  const startsAt = new Date(startIso);
  if (!Number.isInteger(serviceId) || !Number.isInteger(doctorId) || Number.isNaN(startsAt.getTime()) || !WHO.has(p?.who)) {
    return { errors: { _form: "Не удалось определить время приёма. Выберите его заново." } };
  }
  const form = { fio: str(p.form?.fio), dob: str(p.form?.dob), phone: str(p.form?.phone), repFio: str(p.form?.repFio), phone2: str(p.form?.phone2) };
  const { sql, adapters, config } = app();
  const r = await startBooking(sql, { sms: adapters.sms, clock: adapters.clock, pepper: process.env.SMS_CODE_PEPPER || "dev-pepper", siteUrl: config.siteUrl }, {
    serviceId, doctorId, startsAt, who: p.who, form, consentPd: p.consentPd === true, consentPrepay: p.consentPrepay === true,
    payChoice: p.payChoice === "reserve" ? "reserve" : "online", ...requestMeta(await headers()),
  });
  if (!r.ok) return { errors: r.errors };
  await clearPrefill();
  redirect(`/zapis/${r.token}/kod`);
}
