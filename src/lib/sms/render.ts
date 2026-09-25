// СМС пациенту (дизайн v2: все уведомления — по телефону). Текст собирается
// в момент отправки по актуальным данным записи; в очереди лежит имя шаблона.
import { localDay } from "@/domain/time";
import { rub, hhmmOf, relName, dateNum, wdShort } from "@/lib/format";
import { RETAIN_WORDING } from "@/lib/texts";

export const SMS_TEMPLATES = [
  "booking_confirmed", "booking_reminder", "booking_transferred", "booking_expired", "booking_consent_given",
  "booking_cancelled_refund", "booking_cancelled_retained", "booking_cancelled_unpaid",
] as const;
export type SmsTemplate = (typeof SMS_TEMPLATES)[number];

export type SmsContext = {
  siteUrl: string; token: string; now: Date;
  clinic: { address: string; phone: string };
  serviceTitle: string; doctorShort: string; startsAt: Date;
  prepayKopecks: number; arriveEarlyMinutes: number;
  status: string; payDeadline: Date | null;
  refundReason: "cooling_off" | "before_threshold" | "by_clinic" | null;
  /** Как вернём аванс: на карту через эквайринг, наличными в кассе или переводом. */
  refundMethod?: "provider" | "cash" | "bank";
};

export const isSmsTemplate = (v: string): v is SmsTemplate => (SMS_TEMPLATES as readonly string[]).includes(v);

export function renderSms(template: SmsTemplate, c: SmsContext): string {
  const today = localDay(c.now);
  const site = c.siteUrl.replace(/\/$/, "");
  const link = `${site}/moya-zapis/${c.token}`;
  // «завтра, 25 сентября в 10:30» или «чт, 17 сентября в 10:00»
  const day = localDay(c.startsAt);
  const when = `${relName(day, today) || wdShort(day)}, ${dateNum(day)} в ${hhmmOf(c.startsAt)}`;
  const prepay = rub(c.prepayKopecks);
  // «Жаворонкова Е. В.» уже кончается точкой — вторую не ставим.
  const doc = c.doctorShort.endsWith(".") ? c.doctorShort : `${c.doctorShort}.`;
  switch (template) {
    case "booking_confirmed":
      return `Лотос: запись подтверждена — ${when}, ${doc} Предоплата ${prepay} получена. ${link}`;
    case "booking_reminder":
      if ((c.status === "pending" || c.status === "held") && c.payDeadline) {
        const d = localDay(c.payDeadline);
        return `Лотос: приём ${when}, ${doc} Внесите предоплату ${prepay} до ${hhmmOf(c.payDeadline)} ${relName(d, today) || dateNum(d)}, иначе бронь снимется: ${link}`;
      }
      return `Лотос: ждём вас ${when}, ${doc} ${c.clinic.address}. Приходите за ${c.arriveEarlyMinutes} мин. Перенести или отменить: ${link}`;
    case "booking_transferred":
      return `Лотос: запись перенесена на ${when}, ${doc} Предоплата перешла на новую запись. ${link}`;
    case "booking_consent_given":
      return `Лотос: пациент дал согласие на обработку данных — запись на ${when}, ${doc} в силе. ${link}`;
    case "booking_expired":
      return `Лотос: бронь на ${when} снята — предоплата не поступила вовремя. Записаться снова: ${site}`;
    case "booking_cancelled_refund": {
      const back = c.refundMethod === "cash" ? `Предоплату ${prepay} вернём наличными в регистратуре.`
        : c.refundMethod === "bank" ? `Предоплату ${prepay} вернём переводом — регистратура уточнит реквизиты.`
        : `Предоплата ${prepay} вернётся на карту.`;
      return c.refundReason === "by_clinic"
        ? `Лотос: клиника отменила запись на ${when}. ${back} Вопросы: ${c.clinic.phone}`
        : `Лотос: запись на ${when} отменена. ${back}`;
    }
    case "booking_cancelled_retained":
      return `Лотос: запись на ${when} отменена. Предоплата ${prepay} ${RETAIN_WORDING}. Вопросы: ${c.clinic.phone}`;
    case "booking_cancelled_unpaid":
      return `Лотос: запись на ${when} отменена.`;
  }
}
