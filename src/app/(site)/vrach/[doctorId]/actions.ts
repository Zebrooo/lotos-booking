"use server";
// Перенос записи со страницы врача: токен записи из ссылки, всё остальное
// сценарий переносa перечитывает из базы.
import { redirect } from "next/navigation";
import { app } from "@/lib/app";
import { transferBooking } from "@/lib/usecases/transfer";
import { UsecaseError } from "@/lib/usecases/errors";
import { TOKEN_RE } from "@/lib/params";

export async function rescheduleAction(token: string, doctorId: number, startIso: string): Promise<void> {
  const startsAt = new Date(startIso);
  if (!TOKEN_RE.test(token) || !Number.isInteger(doctorId) || Number.isNaN(startsAt.getTime())) redirect("/");
  const { sql, adapters } = app();
  let target: string;
  try {
    const r = await transferBooking(sql, adapters.clock, { token, actor: "patient", doctorId, startsAt });
    target = `/zapis/${r.newToken}?pereneseno=1`;
  } catch (e) {
    if (!(e instanceof UsecaseError)) throw e;
    target = `/moya-zapis/${token}?perenos=${e.code}`;
  }
  redirect(target);
}
