"use server";
// Действия личного кабинета. Каждое берёт телефон из сессии и проверяет,
// что запись или документ принадлежат ему; из браузера приходят только номера.
import { redirect } from "next/navigation";
import { app } from "@/lib/app";
import { requestLoginCode, loginWithCode, updateAccount, markDocumentRead, requestFromCabinet, bookingOfPhone } from "@/lib/cabinet/actions";
import { endPatientSession } from "@/lib/cabinet/session";
import { setSessionCookie, readSessionCookie, clearSessionCookie } from "@/lib/cabinet/cookie";
import { currentPhone } from "@/lib/cabinet/session-view";
import { cabinetData, REFUND_HOW } from "@/lib/cabinet/data";
import { createPayment } from "@/lib/usecases/payment";
import { cancelBooking } from "@/lib/usecases/cancel";
import { UsecaseError } from "@/lib/usecases/errors";
import { savePrefill } from "@/lib/prefill";
import { maskPhone } from "@/lib/forms/booking-v2";
import { rub } from "@/lib/format";

const deps = () => {
  const { sql, adapters, config } = app();
  return { sql, adapters, config, sms: { sms: adapters.sms, clock: adapters.clock, pepper: process.env.SMS_CODE_PEPPER || "dev-pepper" } };
};
async function requirePhone(): Promise<string> {
  const phone = await currentPhone();
  if (!phone) redirect("/kabinet");
  return phone;
}

export async function requestLoginCodeAction(masked: string): Promise<{ ok: boolean; error: string | null }> {
  const { sql, sms } = deps();
  const r = await requestLoginCode(sql, sms, String(masked).slice(0, 30));
  return r.ok ? { ok: true, error: null } : { ok: false, error: r.error };
}

export async function loginAction(masked: string, code: string): Promise<{ error: string }> {
  const { sql, sms } = deps();
  const r = await loginWithCode(sql, sms, String(masked).slice(0, 30), String(code).slice(0, 8));
  if (!r.ok) return { error: r.error };
  await setSessionCookie(r.sessionToken);
  redirect("/kabinet");
}

export async function logoutAction(): Promise<void> {
  const { sql } = deps();
  await endPatientSession(sql, await readSessionCookie());
  await clearSessionCookie();
  redirect("/kabinet");
}

export async function payVisitAction(bookingId: number): Promise<{ error: string }> {
  const phone = await requirePhone();
  const { sql, adapters, config } = deps();
  const b = await bookingOfPhone(sql, phone, Number(bookingId));
  if (!b) return { error: "Запись не найдена" };
  let url: string;
  try {
    url = (await createPayment(sql, { payment: adapters.payment, clock: adapters.clock }, { token: b.token, returnUrl: `${config.siteUrl}/kabinet` })).payUrl;
  } catch (e) {
    if (e instanceof UsecaseError) return { error: "Срок оплаты истёк" };
    throw e;
  }
  redirect(url);
}

export async function cancelVisitAction(bookingId: number): Promise<{ ok: boolean; message: string }> {
  const phone = await requirePhone();
  const { sql, adapters } = deps();
  const b = await bookingOfPhone(sql, phone, Number(bookingId));
  if (!b) return { ok: false, message: "Запись не найдена" };
  try {
    const r = await cancelBooking(sql, adapters.clock, { bookingId: b.id, actor: "patient" });
    if (r.refundId == null) return { ok: true, message: "Запись отменена" };
    const [rf] = await sql<{ method: "provider" | "cash" | "bank" }[]>`select method from refunds where id = ${r.refundId}`;
    const how = rf?.method === "cash" ? "cash" : rf?.method === "bank" ? "bank" : "card";
    return { ok: true, message: `Запись отменена · ${rub(b.prepayKopecks)} вернутся ${REFUND_HOW[how]}` };
  } catch (e) {
    if (e instanceof UsecaseError) return { ok: false, message: "Эту запись уже нельзя отменить" };
    throw e;
  }
}

export async function markReadAction(documentId: number): Promise<void> {
  const phone = await requirePhone();
  await markDocumentRead(deps().sql, phone, Number(documentId));
}

export async function updateAccountAction(patch: { email?: string; notifyRemind?: boolean; notifyResults?: boolean; notifyEmail?: boolean }): Promise<{ error: string | null }> {
  const phone = await requirePhone();
  const clean = {
    email: typeof patch.email === "string" ? patch.email.slice(0, 200) : undefined,
    notifyRemind: typeof patch.notifyRemind === "boolean" ? patch.notifyRemind : undefined,
    notifyResults: typeof patch.notifyResults === "boolean" ? patch.notifyResults : undefined,
    notifyEmail: typeof patch.notifyEmail === "boolean" ? patch.notifyEmail : undefined,
  };
  const r = await updateAccount(deps().sql, phone, clean);
  return { error: r.ok ? null : r.error };
}

export async function cabinetRequestAction(kind: "tax" | "child"): Promise<void> {
  const phone = await requirePhone();
  const { sql, adapters } = deps();
  await requestFromCabinet(sql, adapters.clock, phone, kind === "tax" ? "tax" : "child");
}

/** «Записать» из кабинета: черновик формы на человека из семьи и переход к врачу или поиску. */
export async function bookForAction(personId: number, target: string): Promise<void> {
  const phone = await requirePhone();
  const { sql, adapters } = deps();
  const data = await cabinetData(sql, adapters.clock, phone);
  const person = data?.people.find(p => p.id === Number(personId));
  if (data && person) {
    await savePrefill(person.isOwner
      ? { who: "self", form: { fio: person.full, dob: person.dob, phone: maskPhone(phone), repFio: "", phone2: "" } }
      : { who: "child", form: { fio: person.full, dob: person.dob, phone: maskPhone(phone), repFio: data.owner.fullName, phone2: "" } });
  }
  redirect(target.startsWith("/vrach/") || target === "/" ? target : "/");
}
