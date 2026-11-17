export const COOKIE_CONSENT_NAME = "lotos_cookie_consent";
export const COOKIE_CONSENT_VERSION = 1;
export const COOKIE_CONSENT_MAX_AGE = 180 * 24 * 60 * 60;

export type CookieChoice = { necessary: true; analytics: boolean; version: typeof COOKIE_CONSENT_VERSION; updatedAt: string };

export function newCookieChoice(analytics: boolean, now = new Date()): CookieChoice {
  return { necessary: true, analytics, version: COOKIE_CONSENT_VERSION, updatedAt: now.toISOString() };
}

export function parseCookieChoice(raw: string | undefined): CookieChoice | null {
  if (!raw || raw.length > 500) return null;
  try {
    const value = JSON.parse(raw) as Partial<CookieChoice>;
    if (value.necessary !== true || typeof value.analytics !== "boolean" || value.version !== COOKIE_CONSENT_VERSION) return null;
    if (typeof value.updatedAt !== "string" || !Number.isFinite(Date.parse(value.updatedAt))) return null;
    return { necessary: true, analytics: value.analytics, version: COOKIE_CONSENT_VERSION, updatedAt: value.updatedAt };
  } catch {
    return null;
  }
}
