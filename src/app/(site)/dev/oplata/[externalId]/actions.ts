"use server";
import { notFound, redirect } from "next/navigation";
import { app } from "@/lib/app";
import { payWithFake } from "@/lib/usecases/fake-pay";

export async function fakePayAction(externalId: string): Promise<void> {
  const { sql, adapters } = app();
  if (adapters.payment.name !== "fake" || process.env.NODE_ENV === "production") notFound();
  const r = await payWithFake(sql, adapters.clock, adapters.payment, process.env.FAKE_PAYMENT_SECRET || "dev-secret", externalId, "paid");
  if (!r.token) notFound();
  redirect(`/zapis/${r.token}`);
}
