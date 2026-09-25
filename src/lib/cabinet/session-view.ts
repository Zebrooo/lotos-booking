// Чтение сессии кабинета в серверных компонентах: cookie → телефон → владелец.
import { app } from "@/lib/app";
import { phoneBySession, cabinetOwner, type CabinetOwner } from "./session";
import { readSessionCookie } from "./cookie";

export async function currentPhone(): Promise<string | null> {
  const token = await readSessionCookie();
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
