"use server";
import { notFound, redirect } from "next/navigation";
import { app } from "@/lib/app";
import { payWithFake } from "@/lib/usecases/fake-pay";

export async function fakePayAction(externalId: string, status: "paid" | "failed"): Promise<void> {
  const { sql, adapters } = app();
  if (adapters.payment.name !== "fake" || process.env.NODE_ENV === "production") notFound();
  const r = await payWithFake(sql, adapters.clock, adapters.payment, process.env.FAKE_PAYMENT_SECRET || "dev-secret", externalId, status);
  if (!r.token) notFound();
  redirect(`/moya-zapis/${r.token}${status === "failed" ? "?oplata=otkaz" : ""}`);
}
