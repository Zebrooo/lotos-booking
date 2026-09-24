import { describe, it, expect } from "vitest";
import { renderEmail, EMAIL_TEMPLATES, type EmailContext } from "./render";
import { RETAIN_WORDING } from "@/lib/texts";
import { localTime } from "@/domain/time";

const ctx: EmailContext = {
  siteUrl: "https://zapis.example.ru",
  token: "AbCdEfGhIjKlMnOpQrStU",
  clinic: { name: "Медицинский центр «Лотос»", address: "Челябинск, ул. Примерная, 1", phone: "+7 351 000-00-00" },
  serviceTitle: "Консультация кардиолога",
  doctorTitle: "Жаворонкова А. А.",
  startsAt: localTime("2026-09-17", 600),
  prepayKopecks: 40000,
  arriveEarlyMinutes: 10,
  prepNote: null,
  refundReason: null,
};
const link = "https://zapis.example.ru/moya-zapis/AbCdEfGhIjKlMnOpQrStU";

describe("renderEmail", () => {
  it.each(EMAIL_TEMPLATES)("%s: ссылка, услуга, врач, время, телефон клиники", template => {
    const m = renderEmail(template, ctx);
    expect(m.subject.length).toBeGreaterThan(5);
    for (const part of [link, "Консультация кардиолога", "Жаворонкова А. А.", "чт, 17 сентября, 10:00", "+7 351 000-00-00"]) {
      expect(m.text).toContain(part);
    }
  });

  it("подтверждение и напоминание: прийти заранее, паспорт, способ оплаты остатка, памятка", () => {
    for (const t of ["booking_confirmed", "booking_reminder"] as const) {
      const m = renderEmail(t, { ...ctx, prepNote: "Приходите натощак." });
      expect(m.text).toContain("за 10 минут");
      expect(m.text).toContain("паспорт");
      expect(m.text).toContain("картой или наличными");
      expect(m.text).toContain("Приходите натощак.");
    }
    expect(renderEmail("booking_confirmed", ctx).subject).toBe("Запись подтверждена: Консультация кардиолога, чт, 17 сентября, 10:00");
  });

  it("отмена с удержанием — только формулировка о фактических расходах", () => {
    expect(renderEmail("booking_cancelled_retained", ctx).text).toContain(RETAIN_WORDING);
  });

  it("отмена с возвратом учитывает причину", () => {
    expect(renderEmail("booking_cancelled_refund", { ...ctx, refundReason: "by_clinic" }).text).toContain("Приём отменяет клиника");
    expect(renderEmail("booking_cancelled_refund", { ...ctx, refundReason: "before_threshold" }).text).toContain("зависит от банка");
  });

  it("неизвестный шаблон — ошибка", () => {
    expect(() => renderEmail("spam" as never, ctx)).toThrow(/шаблон/);
  });
});
