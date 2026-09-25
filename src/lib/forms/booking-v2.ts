// Форма записи v2: маски и проверки дословно по прототипу «Запись (клиент)».
// Модуль без серверных зависимостей — его зовут и форма в браузере для
// подсказок на лету, и серверное действие как окончательную проверку.
export type Who = "self" | "child" | "other";
export type FormV2 = { fio: string; dob: string; phone: string; repFio: string; phone2: string };
export type FieldErrors = Partial<Record<keyof FormV2, string>>;

export const CONSENT_ERROR = "Отметьте оба пункта — без них записаться нельзя";

/** Телефон к виду «+7 900 123-45-67» по мере ввода. */
export function maskPhone(v: string): string {
  let d = v.replace(/\D/g, "");
  if (!d) return "";
  if (d[0] === "8") d = "7" + d.slice(1);
  else if (d[0] !== "7") d = "7" + d;
  d = d.slice(0, 11);
  const p = d.slice(1);
  let o = "+7";
  if (p.length) o += " " + p.slice(0, 3);
  if (p.length > 3) o += " " + p.slice(3, 6);
  if (p.length > 6) o += "-" + p.slice(6, 8);
  if (p.length > 8) o += "-" + p.slice(8, 10);
  return o;
}

/** Дата к виду «дд.мм.гггг» по мере ввода. */
export function maskDob(v: string): string {
  const d = v.replace(/\D/g, "").slice(0, 8);
  let o = d.slice(0, 2);
  if (d.length > 2) o += "." + d.slice(2, 4);
  if (d.length > 4) o += "." + d.slice(4);
  return o;
}

/** «+7 900 123-45-67» → «+79001234567». */
export function phoneE164(masked: string): string {
  return "+" + masked.replace(/\D/g, "");
}

const pl = (n: number, a: string, b: string, c: string) => {
  const x = n % 10, y = n % 100;
  return x === 1 && y !== 11 ? a : x >= 2 && x <= 4 && (y < 10 || y >= 20) ? b : c;
};

/** Разбор даты рождения; today — дата клиники YYYY-MM-DD. */
export function parseDob(v: string, today: string): { ok: true; age: number; iso: string } | { ok: false; err: string } {
  const m = /^(\d{2})\.(\d{2})\.(\d{4})$/.exec(v || "");
  if (!m) return { ok: false, err: "Дата неполная — формат дд.мм.гггг" };
  const d = +m[1]!, mo = +m[2]!, y = +m[3]!;
  const dt = new Date(Date.UTC(y, mo - 1, d));
  if (mo < 1 || mo > 12 || dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d) return { ok: false, err: "Такой даты нет — проверьте день и месяц" };
  const iso = `${m[3]}-${m[2]}-${m[1]}`;
  if (iso > today) return { ok: false, err: "Дата рождения не может быть в будущем" };
  if (y < 1900) return { ok: false, err: "Проверьте год рождения" };
  const [ty, tm, td] = today.split("-").map(Number) as [number, number, number];
  const age = ty - y - (tm < mo || (tm === mo && td < d) ? 1 : 0);
  return { ok: true, age, iso };
}

function nameErr(v: string, what: string): string {
  const t = v.trim();
  if (!t) return "Укажите " + what;
  if (!/^[А-Яа-яЁёA-Za-z\-\s]+$/.test(t)) return "Только буквы — например, Иванова Мария Петровна";
  if (t.split(/\s+/).length < 2) return "Нужны и фамилия, и имя";
  return "";
}

export function fieldErrors(who: Who, f: FormV2, today: string): FieldErrors {
  const e: FieldErrors = {};
  const fe = nameErr(f.fio, "фамилию и имя");
  if (fe) e.fio = fe;
  if (!f.dob) e.dob = "Укажите дату рождения";
  else {
    const p = parseDob(f.dob, today);
    if (!p.ok) e.dob = p.err;
    else if (who === "child" && p.age >= 18) e.dob = "Ребёнку должно быть меньше 18 лет";
    else if (who !== "child" && p.age < 18) e.dob = "Пациенту нет 18 лет — выберите «Ребёнок»";
  }
  const pd = f.phone.replace(/\D/g, "");
  if (!pd) e.phone = "Укажите телефон — пришлём код";
  else if (pd.length < 11) e.phone = "Номер неполный: нужно 10 цифр после +7";
  else if (pd[1] !== "9") e.phone = "Нужен мобильный — на него придёт СМС";
  if (who === "child") {
    const r = nameErr(f.repFio, "ФИО представителя");
    if (r) e.repFio = r;
  }
  if (who === "other") {
    const p2 = f.phone2.replace(/\D/g, "");
    if (p2.length < 11 || p2[1] !== "9") e.phone2 = "Нужен мобильный номер пациента";
    else if (p2 === pd) e.phone2 = "Номер пациента совпадает с вашим";
  }
  return e;
}

/** Подсказка под датой рождения, когда дата верна: «Пациенту 38 лет». */
export function dobHint(who: Who, f: FormV2, today: string): string | null {
  if (!f.dob || fieldErrors(who, f, today).dob) return null;
  const p = parseDob(f.dob, today);
  return p.ok ? `Пациенту ${p.age} ${pl(p.age, "год", "года", "лет")}` : null;
}
