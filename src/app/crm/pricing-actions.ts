"use server";

import { app } from "@/lib/app";
import { requireStaff } from "@/lib/staff/session-view";
import { addExternalService, importInvitroPrices, resetServiceToExternal, updateServicePrice } from "@/lib/pricing/pricing";

type R = { ok: boolean; error: string | null };
const result = (error: unknown): R => ({ ok: false, error: error instanceof Error ? error.message : "Неизвестная ошибка" });

export async function importPricesAction(): Promise<R> {
  const staff = await requireStaff(["admin", "senior"]);
  const { sql } = app();
  try {
    const run = await importInvitroPrices(sql);
    await sql`insert into audit (admin_id, action, booking_id, details) values (${staff.id}, 'price_import_invitro', null,
      ${sql.json({ runId: run.id, totalProducts: run.totalProducts } as never)})`;
    return { ok: true, error: null };
  } catch (error) {
    return result(error);
  }
}

export async function addExternalServiceAction(externalId: string): Promise<R & { serviceId?: number }> {
  const staff = await requireStaff(["admin", "senior"]);
  const { sql } = app();
  try {
    const added = await addExternalService(sql, String(externalId).slice(0, 80), staff.id);
    return { ok: true, error: null, serviceId: added.serviceId };
  } catch (error) {
    return result(error);
  }
}

export async function updateServicePriceAction(input: { serviceId: number; priceKopecks: number; prepayKopecks: number; durationMin: number; active: boolean }): Promise<R> {
  const staff = await requireStaff(["admin", "senior"]);
  const { sql } = app();
  try {
    await updateServicePrice(sql, { ...input, adminId: staff.id });
    return { ok: true, error: null };
  } catch (error) {
    return result(error);
  }
}

export async function resetServiceToExternalAction(serviceId: number): Promise<R> {
  const staff = await requireStaff(["admin", "senior"]);
  const { sql } = app();
  try {
    await resetServiceToExternal(sql, Number(serviceId), staff.id);
    return { ok: true, error: null };
  } catch (error) {
    return result(error);
  }
}
