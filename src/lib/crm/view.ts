// Подписи и цвета CRM — как в прототипе «Лотос v2 - CRM» (ST, money(),
// facts, журнал). Из записи CRM делаем готовые строки для экрана: клиенту
// уходят только они, без дат и без лишних полей.
import { type IsoDay, addDays, localDay, hhmm } from "@/domain/time";
import { rub, dateNum, hhmmOf, wdShort, relName } from "@/lib/format";
import type { CrmBooking, MoneyState } from "./data";

export type StKey = "pending" | "claimed" | "confirmed" | "arrived" | "done" | "noshow" | "cancelled" | "moved";
export const ST: Record<StKey, { l: string; bg: string; fg: string; bd: string }> = {
  pending: { l: "Ждёт оплаты", bg: "var(--color-accent-100)", fg: "var(--color-accent-800)", bd: "1px solid var(--color-accent-300)" },
  claimed: { l: "Оплата заявлена", bg: "repeating-linear-gradient(135deg,var(--color-accent-100) 0 6px,var(--color-bg) 6px 10px)", fg: "var(--color-accent-800)", bd: "1px solid var(--color-accent)" },
  confirmed: { l: "Подтверждена", bg: "var(--color-bg)", fg: "var(--color-text)", bd: "1.5px solid var(--color-text)" },
  arrived: { l: "Пришёл, документы", bg: "var(--color-text)", fg: "var(--color-bg)", bd: "1px solid var(--color-text)" },
  done: { l: "Приём состоялся", bg: "var(--color-neutral-200)", fg: "var(--color-neutral-700)", bd: "1px solid var(--color-neutral-300)" },
  noshow: { l: "Неявка", bg: "transparent", fg: "var(--color-neutral-700)", bd: "1px dashed var(--color-neutral-600)" },
  cancelled: { l: "Отменена", bg: "transparent", fg: "var(--color-neutral-600)", bd: "1px dashed var(--color-neutral-400)" },
  moved: { l: "Перенесена", bg: "transparent", fg: "var(--color-neutral-600)", bd: "1px dashed var(--color-neutral-400)" },
};
export const LEGEND = [
  ...(["pending", "claimed", "confirmed", "arrived", "done"] as const).map(k => ({ label: ST[k].l, bg: ST[k].bg, bd: ST[k].bd })),
  { label: "Квота сайта (свободно)", bg: "repeating-linear-gradient(135deg,transparent 0 3px,var(--color-neutral-300) 3px 5px)", bd: "1px dashed var(--color-neutral-500)" },
];
export const SRC: Record<CrmBooking["source"], string> = { site: "Сайт", phone: "Телефон", desk: "Стойка", admin: "Регистратура" };
const SRC_SHORT: Record<CrmBooking["source"], string> = { site: "сайт", phone: "тел.", desk: "стойка", admin: "рег." };

export function stKey(s: CrmBooking["status"]): StKey {
  switch (s) {
    case "held": case "pending": return "pending";
    case "no_show": return "noshow";
    case "transferred": return "moved";
    case "expired": return "cancelled";
    default: return s;
  }
}
/** «24 сентября, чт» — как DAYL в прототипе. */
export const dayl = (day: IsoDay) => `${dateNum(day)}, ${wdShort(day)}`;
/** «24.09 14:32» — время операций в журнале. */
export const tstamp = (at: Date) => { const d = localDay(at); return `${d.slice(8, 10)}.${d.slice(5, 7)} ${hhmmOf(at)}`; };
const dd = (day: IsoDay) => `${day.slice(8, 10)}.${day.slice(5, 7)}`;
export const relDay = (day: IsoDay, today: IsoDay) => relName(day, today) || `${wdShort(day)} ${dd(day)}`;
const deadlineText = (at: Date, today: IsoDay) => { const d = localDay(at); return `${hhmmOf(at)} ${relName(d, today) || dateNum(d)}`; };
const pShort = (full: string) => { const p = full.split(/\s+/); return `${p[0]} ${p[1] ? p[1][0] + "." : ""}${p[2] ? " " + p[2][0] + "." : ""}`.trim(); };

export function moneyShort(m: MoneyState, prepay: number): string {
  return m === "moved" ? "Перенесён" : m === "refund_pending" ? "Возврат инициирован" : m === "refunded" ? "Возвращён" : m === "none" ? "—" : rub(prepay);
}

export type ActionKey = "cash" | "recon" | "arrived" | "done" | "noshow" | "move" | "cancel" | "refund_given";
export type BookingVM = {
  id: number; dayIso: IsoDay; startMin: number; durMin: number; doctorId: number; status: CrmBooking["status"];
  time: string; dayRel: string; patient: string; short: string; phone: string; dob: string; doc: string; svc: string;
  src: string; stKey: StKey; state: string; stBg: string; stFg: string; stBd: string; money: string; paid: boolean; hoursBefore: number;
  block: { sub: string; title: string };
  drawer: {
    src: string; state: string; stColor: string; stateSub: string; money: string; moneySub: string;
    facts: { k: string; v: string }[]; ops: { t: string; op: string; detail: string; amount: string }[];
    actions: { key: ActionKey; label: string; primary: boolean }[];
  };
  recon: { line: string; deadline: string };
};

export function bookingVM(b: CrmBooking, now: Date): BookingVM {
  const today = localDay(now);
  const k = stKey(b.status);
  const st = ST[k];
  const time = hhmm(b.startMin);
  const prepay = rub(b.prepayKopecks);
  const live = ["held", "pending", "claimed", "confirmed"].includes(b.status);
  const deadline = b.deadline ? deadlineText(b.deadline, today) : "";

  const money = b.money === "advance" ? { t: `Аванс ${prepay} получен`, s: "засчитается при оказании" }
    : b.money === "settled" ? { t: `Аванс ${prepay} зачтён`, s: "чек при оказании услуги" }
    : b.money === "retained" ? { t: `Аванс ${prepay} удержан`, s: "неявка" }
    : b.money === "moved" ? { t: "Перенесён", s: "на новую запись" }
    : b.money === "refund_pending" ? { t: "Возврат инициирован", s: b.refundMethod === "cash" ? "выдать наличными в регистратуре" : b.refundMethod === "bank" ? "перевести пациенту и отметить здесь" : "ждём подтверждения банка, затем чек возврата" }
    : b.money === "refunded" ? { t: "Возвращён", s: "чек возврата отправлен" }
    : { t: "Аванс не получен", s: "" };

  const stateSub = b.status === "held" ? `Оплачивает на сайте до ${deadline}`
    : b.status === "pending" ? `Срок оплаты: ${deadline}`
    : b.status === "claimed" ? b.claimNote ?? "Пациент сообщил об оплате"
    : b.status === "cancelled" ? `${b.cancelReason ?? (b.cancelledBy === "clinic" ? "По инициативе клиники" : "По просьбе пациента")}${b.cancelledAt ? ` · ${tstamp(b.cancelledAt)}` : ""}`
    : b.status === "transferred" && b.movedTo ? `Перенесена на ${tstamp(b.movedTo.startsAt)}, ${b.movedTo.doctorShort}`
    : b.consentPending ? "Ждём согласие пациента по ссылке из СМС" : "";

  const reminder = b.reminder.kind === "not_site" ? "не отправляется (запись не с сайта)"
    : b.reminder.kind === "sent" ? `СМС отправлено ${b.reminder.at ? tstamp(b.reminder.at) : ""}`.trim()
    : b.reminder.kind === "queued" ? "СМС в очереди"
    : b.reminder.kind === "planned" && b.reminder.at ? `СМС ${dateNum(localDay(b.reminder.at))} около ${hhmmOf(b.reminder.at)}`
    : "не отправлялось";

  const actions: BookingVM["drawer"]["actions"] = [];
  const isToday = b.day === today;
  if (b.status === "pending") actions.push({ key: "cash", label: "Отметить оплату наличными", primary: true });
  if (b.status === "claimed") actions.push({ key: "recon", label: "Сверить с поступлением", primary: true });
  if (b.status === "confirmed" && isToday) actions.push({ key: "arrived", label: "Пациент пришёл, документы подписаны", primary: true });
  if (b.status === "arrived") actions.push({ key: "done", label: "Приём состоялся", primary: true });
  if (b.status === "confirmed" && b.day <= today) actions.push({ key: "noshow", label: "Отметить неявку", primary: false });
  if (b.money === "refund_pending" && (b.refundMethod === "cash" || b.refundMethod === "bank"))
    actions.push({ key: "refund_given", label: b.refundMethod === "cash" ? `Возврат ${prepay} выдан наличными` : `Возврат ${prepay} переведён`, primary: true });
  if (live && b.status !== "held") {
    actions.push({ key: "move", label: "Перенести", primary: false });
    actions.push({ key: "cancel", label: "Отменить запись", primary: false });
  }

  const sub = b.status === "pending" || b.status === "claimed" || b.status === "held" ? `${st.l} · до ${b.deadline ? hhmmOf(b.deadline) : "—"}` : b.service;
  return {
    id: b.id, dayIso: b.day, startMin: b.startMin, durMin: b.durMin, doctorId: b.doctorId, status: b.status,
    time, dayRel: relDay(b.day, today), patient: b.patient, short: pShort(b.patientFull), phone: b.phone, dob: b.dob, doc: b.doctorShort, svc: b.service,
    src: SRC[b.source], stKey: k, state: st.l, stBg: st.bg, stFg: st.fg, stBd: st.bd, money: moneyShort(b.money, b.prepayKopecks),
    paid: b.money === "advance" || b.money === "settled", hoursBefore: Math.round((b.startsAt.getTime() - now.getTime()) / 3600_000),
    block: { sub: `${sub} · ${SRC_SHORT[b.source]}`, title: `${time} · ${b.patient} · ${sub} · ${SRC_SHORT[b.source]}` },
    drawer: {
      src: SRC[b.source], state: st.l, stColor: b.status === "pending" || b.status === "claimed" || b.status === "held" ? "var(--color-accent-700)" : "var(--color-text)",
      stateSub, money: money.t, moneySub: money.s,
      facts: [
        { k: "Врач", v: b.doctorShort }, { k: "Услуга", v: b.service }, { k: "Когда", v: `${dayl(b.day)}, ${time}` },
        { k: "Записал", v: b.recorder ?? "сам пациент" }, { k: "Напоминание", v: reminder },
      ],
      ops: b.ops.map(o => ({ t: tstamp(o.at), op: o.op, detail: o.detail, amount: o.sign === "0" ? "0 ₽" : `${o.sign}${rub(o.amountKopecks)}` })),
      actions,
    },
    recon: { line: `${b.doctorShort} · ${dateNum(b.day)}, ${time}`, deadline: b.deadline ? `до ${deadline}` : "" },
  };
}

/** Подписи дня в переключателе: «Сегодня, 24 сентября» / «Завтра, 25 сентября». */
export function dayOptions(today: IsoDay): { day: IsoDay; label: string }[] {
  const t = addDays(today, 1);
  return [{ day: today, label: `Сегодня, ${dateNum(today)}` }, { day: t, label: `Завтра, ${dateNum(t)}` }];
}
