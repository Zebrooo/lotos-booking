// Черновик формы записи на время «Изменить номер»: хранится в httpOnly
// cookie на 15 минут, а не в адресе — персональные данные в URL не кладём.
import { cookies } from "next/headers";
import type { StartPayload } from "@/components/booking/booking-form";

const NAME = "lotos_form";

export async function savePrefill(p: Partial<StartPayload>): Promise<void> {
  (await cookies()).set(NAME, JSON.stringify(p), { httpOnly: true, sameSite: "lax", maxAge: 15 * 60, path: "/" });
}
export async function readPrefill(): Promise<Partial<StartPayload> | null> {
  const raw = (await cookies()).get(NAME)?.value;
  if (!raw) return null;
  try {
    const v = JSON.parse(raw) as Partial<StartPayload>;
    return typeof v === "object" && v ? v : null;
  } catch {
    return null;
  }
}
export async function clearPrefill(): Promise<void> {
  (await cookies()).delete(NAME);
}
