import { describe, it, expect } from "vitest";
import { normalizePhone, parseBookingForm } from "./booking-form";

const now = new Date("2026-09-24T06:00:00Z");
const base = {
  relation: "self", fullName: "  Иванов   Иван Иванович ", birthDate: "1980-01-01",
  phone: "8 (912) 345-67-89", email: " Ivanov@Example.com ", consentPd: "on", consentPrepay: "on",
};

describe("normalizePhone", () => {
  it.each([
    ["8 (912) 345-67-89", "+79123456789"],
    ["+7 912 345 67 89", "+79123456789"],
    ["79123456789", "+79123456789"],
    ["9123456789", "+79123456789"],
    ["+7 (351) 222-33-44", "+73512223344"],
  ])("%s → %s", (raw, expected) => {
    expect(normalizePhone(raw)).toBe(expected);
  });
  it.each(["", "12345", "+1 202 555 0100", "8 912 345 67 8", "+7 912 345 67 890", "телефон"])("%s — не телефон", raw => {
    expect(normalizePhone(raw)).toBeNull();
  });
});

describe("parseBookingForm", () => {
  it("запись себя: пробелы убраны, почта в нижнем регистре, телефон нормализован", () => {
    expect(parseBookingForm(base, now)).toEqual({
      ok: true,
      value: {
        relation: "self",
        patient: { fullName: "Иванов Иван Иванович", birthDate: "1980-01-01", phone: "+79123456789", email: "ivanov@example.com" },
        booker: null,
      },
    });
  });

  it("запись ребёнка: пациенту меньше 18, контакты и имя записывающего", () => {
    const r = parseBookingForm({ ...base, relation: "child", fullName: "Иванова Мария", birthDate: "2015-05-20", bookerName: "Иванов Иван" }, now);
    expect(r).toEqual({
      ok: true,
      value: {
        relation: "child",
        patient: { fullName: "Иванова Мария", birthDate: "2015-05-20", phone: "+79123456789", email: "ivanov@example.com" },
        booker: { relation: "child", name: "Иванов Иван", phone: "+79123456789", email: "ivanov@example.com" },
      },
    });
  });

  it("ошибки по полям, по-русски", () => {
    const r = parseBookingForm({ relation: "child", fullName: "Иван", birthDate: "1980-01-01", phone: "123", email: "не-почта" }, now);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.errors).toEqual({
      fullName: "Укажите фамилию и имя",
      birthDate: "Ребёнку должно быть меньше 18 лет",
      bookerName: "Укажите ваши фамилию и имя",
      phone: "Телефон в формате +7 900 000-00-00",
      email: "Проверьте адрес почты",
      consentPd: "Нужно согласие на обработку персональных данных",
      consentPrepay: "Нужно согласие с условиями предоплаты",
    });
  });

  it.each([
    ["2026-13-01", "Дата рождения в формате ДД.ММ.ГГГГ"],
    ["2026-02-30", "Дата рождения в формате ДД.ММ.ГГГГ"],
    ["2026-09-25", "Дата рождения не может быть в будущем"],
    ["1900-01-01", "Проверьте год рождения"],
  ])("дата рождения %s — %s", (birthDate, message) => {
    const r = parseBookingForm({ ...base, birthDate }, now);
    expect(r.ok ? null : r.errors.birthDate).toBe(message);
  });

  it("неизвестное отношение — ошибка поля relation", () => {
    const r = parseBookingForm({ ...base, relation: "friend" }, now);
    expect(r.ok ? null : r.errors.relation).toBe("Выберите, кого записываете");
  });
});
