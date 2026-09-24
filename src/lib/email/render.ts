// Письма пациенту. Текст собирается в момент отправки по актуальным данным
// записи: в очереди уведомлений лежит только имя шаблона.
import { formatDateTime, formatRub, cancelOutcomeText } from "@/lib/texts";

export const EMAIL_TEMPLATES = [
  "booking_confirmed", "booking_reminder", "booking_transferred",
  "booking_cancelled_refund", "booking_cancelled_retained", "booking_cancelled_unpaid",
] as const;
export type EmailTemplate = (typeof EMAIL_TEMPLATES)[number];

export type EmailContext = {
  siteUrl: string; token: string;
  clinic: { name: string; address: string; phone: string };
  serviceTitle: string; doctorTitle: string; startsAt: Date;
  prepayKopecks: number; arriveEarlyMinutes: number; prepNote: string | null;
  refundReason: "cooling_off" | "before_threshold" | "by_clinic" | null;
};

export function isEmailTemplate(v: string): v is EmailTemplate {
  return (EMAIL_TEMPLATES as readonly string[]).includes(v);
}

export function renderEmail(template: EmailTemplate, c: EmailContext): { subject: string; text: string } {
  const when = formatDateTime(c.startsAt);
  const link = `${c.siteUrl.replace(/\/$/, "")}/moya-zapis/${c.token}`;
  const what = [`Услуга: ${c.serviceTitle}`, `Врач: ${c.doctorTitle}`, `Время: ${when}`].join("\n");
  const visit = [
    `Приходите за ${c.arriveEarlyMinutes} минут до приёма, чтобы подписать документы. Возьмите паспорт.`,
    "Остаток стоимости можно оплатить картой или наличными.",
    ...(c.prepNote ? [`Подготовка: ${c.prepNote}`] : []),
  ].join("\n");
  const footer = [`Ваша запись: ${link}`, "", c.clinic.name, c.clinic.address, `Телефон: ${c.clinic.phone}`].join("\n");
  const body = (lead: string, ...rest: string[]) => [lead, "", what, "", ...rest.flatMap(r => [r, ""]), footer].join("\n");

  switch (template) {
    case "booking_confirmed":
      return {
        subject: `Запись подтверждена: ${c.serviceTitle}, ${when}`,
        text: body("Запись подтверждена.", `Предоплата ${formatRub(c.prepayKopecks)} получена, чек придёт отдельным письмом.`, visit),
      };
    case "booking_reminder":
      return {
        subject: `Напоминаем о приёме: ${when}`,
        text: body("Напоминаем о записи.", visit, "Если планы изменились, отмените или перенесите запись по ссылке ниже."),
      };
    case "booking_transferred":
      return {
        subject: `Запись перенесена: ${c.serviceTitle}, ${when}`,
        text: body("Запись перенесена на новое время. Предоплата перешла на новую запись.", visit),
      };
    case "booking_cancelled_refund":
      return {
        subject: `Запись отменена: ${c.serviceTitle}, ${when}`,
        text: body("Запись отменена.", cancelOutcomeText({ kind: "refund", reason: c.refundReason ?? "before_threshold" }, c.prepayKopecks)),
      };
    case "booking_cancelled_retained":
      return {
        subject: `Запись отменена: ${c.serviceTitle}, ${when}`,
        text: body("Запись отменена.", cancelOutcomeText({ kind: "retain", reason: "after_threshold" }, c.prepayKopecks),
          `Если хотите обсудить это, позвоните в клинику: ${c.clinic.phone}.`),
      };
    case "booking_cancelled_unpaid":
      return {
        subject: `Запись отменена: ${c.serviceTitle}, ${when}`,
        text: body("Запись отменена. Оплаты не было, списаний нет."),
      };
    default:
      throw new Error(`Неизвестный шаблон письма: ${String(template)}`);
  }
}
