"use server";
// Серверное действие формы записи. Всё, что пришло из формы и из
// привязанных аргументов, проверяется заново в bookAndPay: слот, врач,
// услуга, согласия. Здесь только перевод результата в ответ формы.
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { app } from "@/lib/app";
import { bookAndPay } from "@/lib/usecases/book";
import { requestMeta } from "@/lib/request-meta";

export type BookFormState = { errors: Record<string, string>; values: Record<string, string> };

const FIELDS = ["relation", "fullName", "birthDate", "bookerName", "phone", "email", "consentPd", "consentPrepay"] as const;

export async function bookAction(serviceId: number, doctorId: number, startIso: string, _prev: BookFormState, formData: FormData): Promise<BookFormState> {
  const values: Record<string, string> = {};
  for (const f of FIELDS) {
    const v = formData.get(f);
    if (typeof v === "string") values[f] = v.slice(0, 300);
  }
  const startsAt = new Date(startIso);
  if (!Number.isInteger(serviceId) || !Number.isInteger(doctorId) || Number.isNaN(startsAt.getTime())) {
    return { errors: { _form: "Не удалось определить время приёма. Выберите его заново." }, values };
  }
  const { sql, adapters, config } = app();
  const r = await bookAndPay(sql, { payment: adapters.payment, clock: adapters.clock }, {
    serviceId, doctorId, startsAt, form: values, siteUrl: config.siteUrl, ...requestMeta(await headers()),
  });
  if (!r.ok) return { errors: r.errors, values };
  redirect(r.payUrl ?? `/moya-zapis/${r.token}`);
}
