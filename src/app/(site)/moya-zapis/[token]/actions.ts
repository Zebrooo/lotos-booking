"use server";
import { redirect } from "next/navigation";
import { app } from "@/lib/app";
import { cancelBooking } from "@/lib/usecases/cancel";
import { UsecaseError } from "@/lib/usecases/errors";
import { TOKEN_RE } from "@/lib/params";

export async function cancelMyBookingAction(token: string): Promise<void> {
  if (!TOKEN_RE.test(token)) redirect("/");
  const { sql, adapters } = app();
  try {
    await cancelBooking(sql, adapters.clock, { token, actor: "patient" });
  } catch (e) {
    if (!(e instanceof UsecaseError)) throw e;
  }
  redirect(`/moya-zapis/${token}`);
}
