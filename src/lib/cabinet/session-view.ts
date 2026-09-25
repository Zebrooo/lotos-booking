// Чтение сессии кабинета в серверных компонентах: cookie → телефон → владелец.
import { cookies } from "next/headers";
import { app } from "@/lib/app";
import { SESSION_COOKIE, phoneBySession, cabinetOwner, type CabinetOwner } from "./session";

export async function currentPhone(): Promise<string | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const { sql, adapters } = app();
  return phoneBySession(sql, adapters.clock, token);
}

export async function currentOwner(): Promise<CabinetOwner | null> {
  const phone = await currentPhone();
  if (!phone) return null;
  const { sql, adapters } = app();
  return cabinetOwner(sql, adapters.clock, phone);
}

/** Буква имени для кружка в шапке; null — пациент не вошёл. */
export async function currentPatientInitial(): Promise<string | null> {
  return (await currentOwner())?.initial ?? null;
}
