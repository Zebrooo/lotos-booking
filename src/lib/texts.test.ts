import { describe, it, expect } from "vitest";
import { formatRub, formatDateTime, formatDay, formatTime, plural, cancelOutcomeText, prepayTermsText, RETAIN_WORDING } from "./texts";
import { localTime } from "@/domain/time";

const NB = " ";

describe("форматирование", () => {
  it("рубли с неразрывными пробелами, копейки только если есть", () => {
    expect(formatRub(40000)).toBe(`400${NB}₽`);
    expect(formatRub(180000)).toBe(`1${NB}800${NB}₽`);
    expect(formatRub(1234567)).toBe(`12${NB}345,67${NB}₽`);
  });
  it("дата и время по часам клиники", () => {
    const at = localTime("2026-09-17", 600);
    expect(formatDateTime(at)).toBe("чт, 17 сентября, 10:00");
    expect(formatDay("2026-09-20")).toBe("вс, 20 сентября");
    expect(formatTime(localTime("2026-09-17", 545))).toBe("09:05");
  });
  it.each([[1, "1 час"], [2, "2 часа"], [5, "5 часов"], [11, "11 часов"], [21, "21 час"], [24, "24 часа"]])("%i → %s", (n, s) => {
    expect(plural(n, ["час", "часа", "часов"])).toBe(s);
  });
});

describe("тексты об отмене", () => {
  const prepay = 40000;
  it("возврат до порога не обещает срок", () => {
    const t = cancelOutcomeText({ kind: "refund", reason: "before_threshold" }, prepay);
    expect(t).toContain(`400${NB}₽ вернётся`);
    expect(t).toContain("зависит от банка");
  });
  it("удержание — формулировка о фактических расходах", () => {
    expect(cancelOutcomeText({ kind: "retain", reason: "after_threshold" }, prepay)).toBe(`Предоплата 400${NB}₽ ${RETAIN_WORDING}.`);
    expect(RETAIN_WORDING).toBe("удерживается в счёт фактически понесённых расходов клиники");
  });
  it("остальные случаи", () => {
    expect(cancelOutcomeText({ kind: "none", reason: "not_paid" }, prepay)).toBe("Запись не оплачена, возвращать нечего.");
    expect(cancelOutcomeText({ kind: "refund", reason: "cooling_off" }, prepay)).toContain("меньше часа назад");
    expect(cancelOutcomeText({ kind: "refund", reason: "by_clinic" }, prepay)).toContain("вернётся полностью");
  });
  it("условия предоплаты называют порог и час на размышление", () => {
    const t = prepayTermsText({ prepayKopecks: prepay, freeCancelHours: 24, coolingOffMinutes: 60 });
    expect(t).toContain(`400${NB}₽`);
    expect(t).toContain("раньше чем за 24 часа");
    expect(t).toContain(RETAIN_WORDING);
    expect(t).toContain("в течение 60 минут после оплаты");
    expect(t).toContain("Отменить запись можно в любой момент");
  });
});
