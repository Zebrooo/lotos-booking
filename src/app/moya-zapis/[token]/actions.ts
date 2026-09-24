"use server";
// Действия пациента со своей записью. Доступ — по токену из ссылки; всё
// остальное перечитывается из базы в сценариях.
import { redirect } from "next/navigation";
import { app } from "@/lib/app";
import { createPayment } from "@/lib/usecases/payment";
import { cancelBooking } from "@/lib/usecases/cancel";
import { transferBooking } from "@/lib/usecases/transfer";
import { UsecaseError } from "@/lib/usecases/errors";

const TOKEN_RE = /^[A-Za-z0-9_-]{21}$/;
const page = (token: string, note?: string) => `/moya-zapis/${token}${note ? `?${note}` : ""}`;

export async function payAction(token: string): Promise<void> {
  if (!TOKEN_RE.test(token)) redirect("/");
  const { sql, adapters, config } = app();
  let payUrl: string | null = null;
  try {
    ({ payUrl } = await createPayment(sql, { payment: adapters.payment, clock: adapters.clock }, { token, returnUrl: `${config.siteUrl}${page(token)}` }));
  } catch (e) {
    if (!(e instanceof UsecaseError)) console.error("[оплата] не удалось создать платёж:", e);
  }
  redirect(payUrl ?? page(token, "oplata=oshibka"));
}

export async function cancelAction(token: string): Promise<void> {
  if (!TOKEN_RE.test(token)) redirect("/");
  const { sql, adapters } = app();
  try {
    await cancelBooking(sql, adapters.clock, { token, actor: "patient" });
  } catch (e) {
    if (!(e instanceof UsecaseError)) throw e;
  }
  redirect(page(token, "otmeneno=1"));
}

export type TransferState = { error: string | null };

export async function transferAction(token: string, _prev: TransferState, formData: FormData): Promise<TransferState> {
  if (!TOKEN_RE.test(token)) redirect("/");
  const startsAt = new Date(String(formData.get("start") ?? ""));
  const doctorId = Number(formData.get("doctor"));
  if (Number.isNaN(startsAt.getTime()) || !Number.isInteger(doctorId)) return { error: "Выберите новое время." };
  const { sql, adapters } = app();
  let newToken: string;
  try {
    ({ newToken } = await transferBooking(sql, adapters.clock, { token, actor: "patient", doctorId, startsAt }));
  } catch (e) {
    if (!(e instanceof UsecaseError)) throw e;
    const messages: Record<string, string> = {
      slot_taken: "Это время только что заняли. Выберите другое.",
      transfer_not_allowed: "Перенести запись теперь можно только по телефону клиники.",
    };
    return { error: messages[e.code] ?? "Это время недоступно. Выберите другое." };
  }
  redirect(page(newToken, "pereneseno=1"));
}
