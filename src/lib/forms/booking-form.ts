// Форма записи: проверка и нормализация ввода пациента. Ошибки по полям и
// по-русски — их показывает форма. При записи ребёнка или родственника
// телефон и почта принадлежат тому, кто записывает: ему идут уведомления.
import { localDay } from "@/domain/time";

export type Relation = "self" | "child" | "relative";
export type BookingFormValue = {
  relation: Relation;
  patient: { fullName: string; birthDate: string; phone: string; email: string };
  booker: { relation: "child" | "relative"; name: string; phone: string; email: string } | null;
};
export type BookingFormResult = { ok: true; value: BookingFormValue } | { ok: false; errors: Record<string, string> };

const RELATIONS: readonly Relation[] = ["self", "child", "relative"];

/** Российский номер к виду +7XXXXXXXXXX; null — не похоже на телефон. */
export function normalizePhone(raw: string): string | null {
  const trimmed = raw.trim();
  if (!/^[+\d\s()-]+$/.test(trimmed)) return null;
  const digits = trimmed.replace(/\D/g, "");
  if (digits.length === 11 && (digits.startsWith("7") || digits.startsWith("8"))) {
    if (trimmed.startsWith("+") && !digits.startsWith("7")) return null;
    return `+7${digits.slice(1)}`;
  }
  // Десять цифр без кода страны: мобильный (9…) или городской (3…, 4…).
  // «8…» из десяти цифр — почти всегда «8 плюс номер» с пропущенной цифрой.
  if (digits.length === 10 && !trimmed.startsWith("+") && /^[349]/.test(digits)) return `+7${digits}`;
  return null;
}

const str = (v: unknown) => (typeof v === "string" ? v : "");
const collapse = (s: string) => s.trim().replace(/\s+/g, " ");

function validName(s: string): boolean {
  if (s.length === 0 || s.length > 120) return false;
  if (!/^[\p{L}][\p{L}\s.'’-]*$/u.test(s)) return false;
  return s.split(" ").filter(w => /\p{L}/u.test(w)).length >= 2;
}

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
function realDate(s: string): boolean {
  if (!DATE_RE.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

/** Полных лет на дату today; обе даты YYYY-MM-DD. */
function ageOn(birth: string, today: string): number {
  const [by, bm, bd] = birth.split("-").map(Number) as [number, number, number];
  const [ty, tm, td] = today.split("-").map(Number) as [number, number, number];
  return ty - by - (tm < bm || (tm === bm && td < bd) ? 1 : 0);
}

export function parseBookingForm(input: Record<string, unknown>, now: Date): BookingFormResult {
  const errors: Record<string, string> = {};
  const relationRaw = str(input.relation) || "self";
  const relation = RELATIONS.find(r => r === relationRaw);
  if (!relation) errors.relation = "Выберите, кого записываете";

  const fullName = collapse(str(input.fullName));
  if (!validName(fullName)) errors.fullName = "Укажите фамилию и имя";

  const birthDate = str(input.birthDate).trim();
  const today = localDay(now);
  if (!realDate(birthDate)) errors.birthDate = "Дата рождения в формате ДД.ММ.ГГГГ";
  else if (birthDate > today) errors.birthDate = "Дата рождения не может быть в будущем";
  else if (ageOn(birthDate, today) > 120) errors.birthDate = "Проверьте год рождения";
  else if (relation === "child" && ageOn(birthDate, today) >= 18) errors.birthDate = "Ребёнку должно быть меньше 18 лет";

  const bookerName = collapse(str(input.bookerName));
  if (relation && relation !== "self" && !validName(bookerName)) errors.bookerName = "Укажите ваши фамилию и имя";

  const phone = normalizePhone(str(input.phone));
  if (!phone) errors.phone = "Телефон в формате +7 900 000-00-00";

  const email = str(input.email).trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 200) errors.email = "Проверьте адрес почты";

  if (str(input.consentPd) !== "on") errors.consentPd = "Нужно согласие на обработку персональных данных";
  if (str(input.consentPrepay) !== "on") errors.consentPrepay = "Нужно согласие с условиями предоплаты";

  if (Object.keys(errors).length > 0 || !relation || !phone) return { ok: false, errors };
  return {
    ok: true,
    value: {
      relation,
      patient: { fullName, birthDate, phone, email },
      booker: relation === "self" ? null : { relation, name: bookerName, phone, email },
    },
  };
}
