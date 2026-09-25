// Разбор параметров адреса: первое значение, целое число, токен записи.
export function first(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}
export function positiveInt(v: string | string[] | undefined): number | null {
  const s = first(v);
  if (!s || !/^\d{1,12}$/.test(s)) return null;
  const n = Number(s);
  return n > 0 ? n : null;
}
export const TOKEN_RE = /^[A-Za-z0-9_-]{21}$/;
export function token(v: string | string[] | undefined): string | null {
  const s = first(v);
  return s && TOKEN_RE.test(s) ? s : null;
}
