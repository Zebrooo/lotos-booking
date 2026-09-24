// Запись с сайта: проверить форму, удержать слот с согласиями последних
// редакций и создать платёж. Если провайдер недоступен, удержание остаётся,
// а оплатить можно со страницы записи, пока не истёк срок.
import type { Sql } from "@/lib/db/client";
import type { Clock } from "@/ports/clock";
import type { PaymentProvider } from "@/ports/payment";
import { parseBookingForm } from "@/lib/forms/booking-form";
import { holdSlot } from "./hold";
import { createPayment } from "./payment";
import { UsecaseError, type UsecaseErrorCode } from "./errors";

export type BookInput = {
  serviceId: number; doctorId: number; startsAt: Date; form: Record<string, unknown>;
  siteUrl: string; ip?: string; userAgent?: string;
};
export type BookResult = { ok: true; token: string; payUrl: string | null } | { ok: false; errors: Record<string, string> };

const MESSAGES: Partial<Record<UsecaseErrorCode, string>> = {
  slot_taken: "Это время только что заняли. Выберите другое.",
  slot_past: "Это время уже недоступно для записи. Выберите другое.",
  slot_closed: "Врач в это время не принимает. Выберите другое.",
  beyond_horizon: "Запись на эту дату ещё не открыта.",
  duplicate_booking: "У вас уже есть запись на это время.",
  online_paused: "Онлайн-запись временно приостановлена. Запишитесь по телефону клиники.",
  doctor_mismatch: "Услуга или врач недоступны для записи.",
  service_inactive: "Услуга или врач недоступны для записи.",
  not_found: "Услуга или врач недоступны для записи.",
  consent_missing: "Тексты согласий не опубликованы, запись временно недоступна.",
};

export async function bookAndPay(sql: Sql, deps: { payment: PaymentProvider; clock: Clock }, input: BookInput): Promise<BookResult> {
  const parsed = parseBookingForm(input.form, deps.clock.now());
  if (!parsed.ok) return parsed;
  const consents = await sql<{ id: number }[]>`select distinct on (kind) id from consents order by kind, version desc`;
  let token: string;
  try {
    const h = await holdSlot(sql, deps.clock, {
      serviceId: input.serviceId, doctorId: input.doctorId, startsAt: input.startsAt,
      patient: parsed.value.patient, booker: parsed.value.booker ?? undefined,
      consentIds: consents.map(c => c.id), ip: input.ip, userAgent: input.userAgent, source: "site",
    });
    token = h.token;
  } catch (e) {
    const message = e instanceof UsecaseError ? MESSAGES[e.code] : undefined;
    if (message) return { ok: false, errors: { _form: message } };
    throw e;
  }
  try {
    const { payUrl } = await createPayment(sql, deps, { token, returnUrl: `${input.siteUrl}/moya-zapis/${token}` });
    return { ok: true, token, payUrl };
  } catch (e) {
    console.error("[запись] платёж не создан, удержание остаётся:", e);
    return { ok: true, token, payUrl: null };
  }
}
