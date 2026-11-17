"use server";

import { cookies } from "next/headers";
import { COOKIE_CONSENT_MAX_AGE, COOKIE_CONSENT_NAME, newCookieChoice, parseCookieChoice, type CookieChoice } from "./consent";

export async function readCookieChoice(): Promise<CookieChoice | null> {
  const raw = (await cookies()).get(COOKIE_CONSENT_NAME)?.value;
  return parseCookieChoice(raw);
}

export async function saveCookieChoice(analytics: boolean): Promise<{ ok: true }> {
  const choice = newCookieChoice(analytics === true);
  (await cookies()).set(COOKIE_CONSENT_NAME, JSON.stringify(choice), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: COOKIE_CONSENT_MAX_AGE,
    path: "/",
  });
  return { ok: true };
}

export async function analyticsAllowed(): Promise<boolean> {
  return (await readCookieChoice())?.analytics === true;
}
