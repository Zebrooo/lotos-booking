import { describe, it, expect } from "vitest";
import { renderSms, SMS_TEMPLATES, type SmsContext } from "./render";
import { localTime } from "@/domain/time";

const base: SmsContext = {
  siteUrl: "https://zapis.lotos74.ru/", token: "tok123", now: new Date("2026-09-24T09:20:00Z"),
  clinic: { address: "Еманжелинск, ул. Гагарина, 12А", phone: "+7 900 023-05-50" },
  serviceTitle: "Консультация кардиолога", doctorShort: "Жаворонкова Е. В.", startsAt: localTime("2026-09-25", 630),
  prepayKopecks: 40000, arriveEarlyMinutes: 15, status: "confirmed", payDeadline: null, refundReason: null,
};

describe("тексты СМС", () => {
  it("подтверждение: когда, к кому, предоплата и ссылка на запись", () => {
    expect(renderSms("booking_confirmed", base)).toBe(
      "Лотос: запись подтверждена — завтра, 25 сентября в 10:30, Жаворонкова Е. В. Предоплата 400 ₽ получена. https://zapis.lotos74.ru/moya-zapis/tok123");
  });
  it("напоминание оплаченной записи — адрес и совет прийти заранее", () => {
    expect(renderSms("booking_reminder", base)).toBe(
      "Лотос: ждём вас завтра, 25 сентября в 10:30, Жаворонкова Е. В. Еманжелинск, ул. Гагарина, 12А. Приходите за 15 мин. Перенести или отменить: https://zapis.lotos74.ru/moya-zapis/tok123");
  });
  it("напоминание неоплаченной брони — срок оплаты", () => {
    const t = renderSms("booking_reminder", { ...base, status: "pending", payDeadline: localTime("2026-09-24", 17 * 60) });
    expect(t).toBe("Лотос: приём завтра, 25 сентября в 10:30, Жаворонкова Е. В. Внесите предоплату 400 ₽ до 17:00 сегодня, иначе бронь снимется: https://zapis.lotos74.ru/moya-zapis/tok123");
  });
  it("отмены и перенос", () => {
    expect(renderSms("booking_cancelled_refund", base)).toBe("Лотос: запись на завтра, 25 сентября в 10:30 отменена. Предоплата 400 ₽ вернётся на карту.");
    expect(renderSms("booking_cancelled_refund", { ...base, refundReason: "by_clinic" })).toBe(
      "Лотос: клиника отменила запись на завтра, 25 сентября в 10:30. Предоплата 400 ₽ вернётся на карту. Вопросы: +7 900 023-05-50");
    expect(renderSms("booking_cancelled_refund", { ...base, refundMethod: "cash" })).toBe("Лотос: запись на завтра, 25 сентября в 10:30 отменена. Предоплату 400 ₽ вернём наличными в регистратуре.");
    expect(renderSms("booking_cancelled_unpaid", base)).toBe("Лотос: запись на завтра, 25 сентября в 10:30 отменена.");
    expect(renderSms("booking_cancelled_retained", base)).toBe(
      "Лотос: запись на завтра, 25 сентября в 10:30 отменена. Предоплата 400 ₽ удерживается в счёт фактически понесённых расходов клиники. Вопросы: +7 900 023-05-50");
    expect(renderSms("booking_transferred", base)).toBe(
      "Лотос: запись перенесена на завтра, 25 сентября в 10:30, Жаворонкова Е. В. Предоплата перешла на новую запись. https://zapis.lotos74.ru/moya-zapis/tok123");
    expect(renderSms("booking_consent_given", base)).toBe(
      "Лотос: пациент дал согласие на обработку данных — запись на завтра, 25 сентября в 10:30, Жаворонкова Е. В. в силе. https://zapis.lotos74.ru/moya-zapis/tok123");
    expect(renderSms("booking_expired", base)).toBe(
      "Лотос: бронь на завтра, 25 сентября в 10:30 снята — предоплата не поступила вовремя. Записаться снова: https://zapis.lotos74.ru");
  });
  it("каждый шаблон укладывается в четыре СМС (кириллица — 67 знаков в части)", () => {
    for (const t of SMS_TEMPLATES) expect(renderSms(t, { ...base, status: "pending", payDeadline: base.now }).length).toBeLessThanOrEqual(268);
  });
});
