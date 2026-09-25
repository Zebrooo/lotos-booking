import { describe, it, expect } from "vitest";
import { maskPhone, maskDob, parseDob, fieldErrors, dobHint, phoneE164, CONSENT_ERROR } from "./booking-v2";

const today = "2026-09-24";
const ok = { fio: "Смирнова Елена Андреевна", dob: "14.03.1988", phone: "+7 900 123-45-67", repFio: "", phone2: "" };

describe("маски как в прототипе", () => {
  it.each([
    ["8", "+7"], ["89", "+7 9"], ["8900123", "+7 900 123"], ["89001234567", "+7 900 123-45-67"],
    ["9001234567", "+7 900 123-45-67"], ["+7 (900) 123-45-67 доб", "+7 900 123-45-67"], ["", ""],
  ])("телефон %s → %s", (raw, masked) => expect(maskPhone(raw)).toBe(masked));
  it.each([["1", "1"], ["140", "14.0"], ["1403", "14.03"], ["14031988", "14.03.1988"], ["14.03.19889", "14.03.1988"]])(
    "дата %s → %s", (raw, masked) => expect(maskDob(raw)).toBe(masked));
  it("телефон в E.164", () => expect(phoneE164("+7 900 123-45-67")).toBe("+79001234567"));
});

describe("parseDob", () => {
  it.each([
    ["14.03", "Дата неполная — формат дд.мм.гггг"],
    ["31.02.2000", "Такой даты нет — проверьте день и месяц"],
    ["01.13.2000", "Такой даты нет — проверьте день и месяц"],
    ["25.09.2026", "Дата рождения не может быть в будущем"],
    ["01.01.1899", "Проверьте год рождения"],
  ])("%s — %s", (v, err) => expect(parseDob(v, today)).toEqual({ ok: false, err }));
  it("возраст полных лет на сегодня", () => {
    expect(parseDob("24.09.2008", today)).toEqual({ ok: true, age: 18, iso: "2008-09-24" });
    expect(parseDob("25.09.2008", today)).toEqual({ ok: true, age: 17, iso: "2008-09-25" });
  });
});

describe("fieldErrors", () => {
  it("всё верно — ошибок нет, подсказка про возраст", () => {
    expect(fieldErrors("self", ok, today)).toEqual({});
    expect(dobHint("self", ok, today)).toBe("Пациенту 38 лет");
    expect(dobHint("child", { ...ok, dob: "24.09.2025" }, today)).toBe("Пациенту 1 год");
    expect(dobHint("self", { ...ok, dob: "24.09.2025" }, today)).toBeNull();
  });
  it("пустая форма — тексты из прототипа", () => {
    expect(fieldErrors("self", { fio: "", dob: "", phone: "", repFio: "", phone2: "" }, today)).toEqual({
      fio: "Укажите фамилию и имя", dob: "Укажите дату рождения", phone: "Укажите телефон — пришлём код",
    });
  });
  it("имя: только буквы и две части", () => {
    expect(fieldErrors("self", { ...ok, fio: "Иванова1 Мария" }, today).fio).toBe("Только буквы — например, Иванова Мария Петровна");
    expect(fieldErrors("self", { ...ok, fio: "Иванова" }, today).fio).toBe("Нужны и фамилия, и имя");
  });
  it("телефон: неполный и не мобильный", () => {
    expect(fieldErrors("self", { ...ok, phone: "+7 900 123" }, today).phone).toBe("Номер неполный: нужно 10 цифр после +7");
    expect(fieldErrors("self", { ...ok, phone: "+7 351 222-33-44" }, today).phone).toBe("Нужен мобильный — на него придёт СМС");
  });
  it("возраст против выбора «кто придёт»", () => {
    expect(fieldErrors("self", { ...ok, dob: "02.06.2017" }, today).dob).toBe("Пациенту нет 18 лет — выберите «Ребёнок»");
    expect(fieldErrors("child", { ...ok, repFio: "Смирнова Елена" }, today).dob).toBe("Ребёнку должно быть меньше 18 лет");
  });
  it("ребёнок: нужно ФИО представителя", () => {
    const child = { ...ok, fio: "Смирнова Мария Игоревна", dob: "02.06.2017" };
    expect(fieldErrors("child", child, today)).toEqual({ repFio: "Укажите ФИО представителя" });
    expect(fieldErrors("child", { ...child, repFio: "Смирнова Елена Андреевна" }, today)).toEqual({});
  });
  it("другой взрослый: мобильный пациента, не совпадающий с вашим", () => {
    expect(fieldErrors("other", ok, today).phone2).toBe("Нужен мобильный номер пациента");
    expect(fieldErrors("other", { ...ok, phone2: ok.phone }, today).phone2).toBe("Номер пациента совпадает с вашим");
    expect(fieldErrors("other", { ...ok, phone2: "+7 912 000-11-22" }, today)).toEqual({});
  });
  it("текст про согласия", () => expect(CONSENT_ERROR).toBe("Отметьте оба пункта — без них записаться нельзя"));
});
