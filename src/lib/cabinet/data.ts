// Данные личного кабинета по телефону: владелец и дети, записи, документы,
// платежи по журналу, согласия и настройки. Всё одним вызовом — вкладки
// кабинета переключаются в браузере без запросов, как в прототипе.
import type { Db } from "@/lib/db/client";
import type { Clock } from "@/ports/clock";
import { localDay } from "@/domain/time";
import { transition, type BookingStatus } from "@/domain/transitions";
import { canTransfer } from "@/domain/cancel";
import { loadSettings } from "@/lib/usecases/settings";
import { dateNum, plural, shortName, rub, lowerFirst } from "@/lib/format";
import { cabinetOwner, type CabinetOwner } from "./session";
import { advanceSource } from "@/lib/usecases/cancel";

export type RefundHow = "card" | "cash" | "bank";
export const REFUND_HOW: Record<RefundHow, string> = { card: "на карту", cash: "наличными в регистратуре", bank: "переводом" };
export type CabPerson = { id: number; name: string; full: string; sub: string; initial: string; dob: string; isOwner: boolean };
export type CabVisit = {
  id: number; token: string; who: number; startsAt: Date; status: BookingStatus; kind: "up" | "done" | "cancelled";
  serviceTitle: string; priceKopecks: number; prepayKopecks: number; prepNote: string | null; doctorId: number; serviceId: number;
  doctorShort: string; doctorSpec: string | null; isLab: boolean;
  paid: boolean; deadline: Date | null; docIds: number[]; note: string | null;
  /** Как вернётся аванс при отмене: на карту, наличными в регистратуре или переводом. */
  refundHow: RefundHow;
  canPay: boolean; canTransfer: boolean; canCancel: boolean;
};
export type LabRow = [string, string, string, string, 0 | 1];
export type DocBody = { sections?: [string, string][]; recs?: string[]; rows?: LabRow[]; next?: { text: string; doctorId: number; serviceId: number } | null };
export type CabDoc = { id: number; who: number; kind: "concl" | "lab" | "study"; title: string; author: string; issuedOn: string; readyOn: string | null; isNew: boolean; body: DocBody };
export type CabPayment = { ledgerId: number; at: Date; what: string; who: number; amountKopecks: number; how: string };
export type CabinetData = {
  owner: CabinetOwner; people: CabPerson[]; visits: CabVisit[]; docs: CabDoc[]; payments: CabPayment[];
  account: { email: string | null; notifyRemind: boolean; notifyResults: boolean; notifyEmail: boolean };
  consents: { title: string; sub: string; href: string }[]; taxRequested: boolean; taxReadyOn: string | null;
  recommendation: { text: string; who: string; doctorId: number; serviceId: number } | null;
};

const TAX_READY_DAYS = 7;
const ageOn = (iso: string, today: string) => {
  const [by, bm, bd] = iso.split("-").map(Number) as [number, number, number];
  const [ty, tm, td] = today.split("-").map(Number) as [number, number, number];
  return ty - by - (tm < bm || (tm === bm && td < bd) ? 1 : 0);
};
const ru = (iso: string) => `${iso.slice(8, 10)}.${iso.slice(5, 7)}.${iso.slice(0, 4)}`;
/** Дочь или сын — по отчеству; иначе «Ребёнок». */
function childLabel(full: string): string {
  const patr = full.split(/\s+/)[2] ?? "";
  if (/(вна|чна|кызы)$/i.test(patr)) return "Дочь";
  if (/(вич|ич|оглы)$/i.test(patr)) return "Сын";
  return "Ребёнок";
}

export async function cabinetData(sql: Db, clock: Clock, phone: string): Promise<CabinetData | null> {
  const owner = await cabinetOwner(sql, clock, phone);
  if (!owner) return null;
  const now = clock.now();
  const today = localDay(now);
  const settings = await loadSettings(sql);

  const patients = await sql<{ id: number; fullName: string; birthDate: string }[]>`select id, full_name, to_char(birth_date, 'YYYY-MM-DD') as birth_date
    from patients where phone = ${phone} order by birth_date`;
  const people: CabPerson[] = patients
    .filter(p => p.id === owner.id || ageOn(p.birthDate, today) < 18)
    .map(p => {
      const age = ageOn(p.birthDate, today);
      const isOwner = p.id === owner.id;
      const name = p.fullName.split(/\s+/)[1] ?? p.fullName;
      return { id: p.id, name, full: p.fullName, initial: name[0] ?? "?", dob: ru(p.birthDate), isOwner,
        sub: `${isOwner ? "Вы" : childLabel(p.fullName)} · ${age} ${plural(age, "год", "года", "лет")}` };
    })
    .sort((a, b) => Number(b.isOwner) - Number(a.isOwner));
  const ids = people.map(p => p.id);

  const rows = await sql<{
    id: number; token: string; patientId: number; startsAt: Date; status: BookingStatus; service: { title: string; priceKopecks: number; prepayKopecks: number };
    prepNote: string | null; resourceId: number; serviceId: number; resourceTitle: string; resourceKind: string; specialty: string | null;
    paidAt: Date | null; holdUntil: Date | null; payDeadline: Date | null; cancelledAt: Date | null; cancelledBy: string | null; cancelReason: string | null;
    balance: number; refunded: boolean;
  }[]>`select b.id, b.token, b.patient_id, b.starts_at, b.status, b.service, s.prep_note, b.resource_id, b.service_id,
      r.title as resource_title, r.kind as resource_kind, r.specialty, b.paid_at, b.hold_until, b.pay_deadline,
      b.cancelled_at, b.cancelled_by, b.cancel_reason,
      coalesce((select sum(case when l.kind in ('advance', 'transfer_in') then l.amount_kopecks when l.kind in ('settle', 'refund', 'transfer_out') then -l.amount_kopecks else 0 end)
        from ledger l where l.booking_id = b.id), 0)::int as balance,
      exists (select 1 from ledger l where l.booking_id = b.id and l.kind = 'refund') as refunded
    from bookings b join resources r on r.id = b.resource_id join services s on s.id = b.service_id
    where b.patient_id in ${sql(ids)} and b.status <> 'expired' and not (b.status = 'held' and b.phone_verified_at is null)
    order by b.starts_at`;
  const docRows = await sql<{ id: number; patientId: number; bookingId: number | null; kind: CabDoc["kind"]; title: string; author: string; issuedOn: string; readyOn: string | null; body: DocBody; read: boolean }[]>`
    select d.id, d.patient_id, d.booking_id, d.kind, d.title, d.author, to_char(d.issued_on, 'YYYY-MM-DD') as issued_on,
      to_char(d.ready_on, 'YYYY-MM-DD') as ready_on, d.body,
      exists (select 1 from document_reads x where x.document_id = d.id and x.phone = ${phone}) as read
    from medical_documents d where d.patient_id in ${sql(ids)} order by d.issued_on desc, d.id desc`;

  // Путь возврата — по источнику аванса (с учётом переносов): эквайринг, касса или перевод.
  const how = new Map<number, RefundHow>();
  for (const b of rows) {
    if (b.balance <= 0 && !b.refunded) continue;
    const src = await advanceSource(sql, b.id);
    how.set(b.id, src.paymentId ? "card" : src.channel === "cash" ? "cash" : "bank");
  }
  const visits: CabVisit[] = rows.map(b => {
    const live = ["held", "pending", "claimed", "confirmed"].includes(b.status);
    const kind: CabVisit["kind"] = live ? "up" : ["cancelled", "transferred"].includes(b.status) ? "cancelled" : "done";
    const paid = b.paidAt != null || b.balance > 0;
    let note: string | null = null;
    if (b.status === "transferred") note = "Перенесена — предоплата перешла на новую запись";
    else if (b.status === "cancelled") {
      const cday = b.cancelledAt ? localDay(b.cancelledAt) : null;
      const when = cday ? (cday === today ? "сегодня" : dateNum(cday)) : "";
      note = b.cancelledBy === "clinic" ? `Клиника отменила${b.cancelReason ? `: ${b.cancelReason}` : ""}` : `Вы отменили ${when}`;
      if (b.refunded) note += ` · ${rub(b.service.prepayKopecks)} вернули ${REFUND_HOW[how.get(b.id) ?? "card"]}`;
      else if (paid) note += ` · ${rub(b.service.prepayKopecks)} вернутся ${REFUND_HOW[how.get(b.id) ?? "card"]}`;
    }
    const deadline = b.status === "held" ? b.holdUntil : b.payDeadline;
    return {
      id: b.id, token: b.token, who: b.patientId, startsAt: b.startsAt, status: b.status, kind,
      serviceTitle: b.service.title, priceKopecks: b.service.priceKopecks, prepayKopecks: b.service.prepayKopecks, prepNote: b.prepNote,
      doctorId: b.resourceId, serviceId: b.serviceId, isLab: b.resourceKind !== "doctor",
      doctorShort: b.resourceKind === "doctor" ? shortName(b.resourceTitle) : b.resourceTitle, doctorSpec: b.specialty,
      paid: kind === "up" ? b.status === "confirmed" : paid, deadline, refundHow: how.get(b.id) ?? "card", docIds: docRows.filter(d => d.bookingId === b.id).map(d => d.id), note,
      canPay: (b.status === "pending" || b.status === "claimed") && deadline != null && deadline > now || (b.status === "held" && deadline != null && deadline > now),
      canTransfer: transition(b.status, "transfer", "patient").ok && canTransfer({ now, startsAt: b.startsAt, actor: "patient", settings }),
      canCancel: transition(b.status, "cancel", "patient").ok,
    };
  });

  const docs: CabDoc[] = docRows.map(d => ({
    id: d.id, who: d.patientId, kind: d.kind, title: d.title, author: d.author, issuedOn: d.issuedOn, readyOn: d.readyOn,
    isNew: !d.read && !(d.readyOn && d.readyOn > today), body: d.body,
  }));

  const ledger = await sql<{ id: number; bookingId: number; kind: string; amountKopecks: number; channel: string | null; createdAt: Date }[]>`
    select id, booking_id, kind, amount_kopecks, channel, created_at from ledger
    where booking_id in ${sql(rows.length ? rows.map(r => r.id) : [0])} and kind in ('advance', 'refund') order by created_at desc, id desc`;
  const byId = new Map(rows.map(r => [r.id, r]));
  const payments: CabPayment[] = ledger.map(l => {
    const b = byId.get(l.bookingId)!;
    const svc = lowerFirst(b.service.title);
    if (l.kind === "refund") return { ledgerId: l.id, at: l.createdAt, who: b.patientId, amountKopecks: -l.amountKopecks, what: `Возврат предоплаты · ${svc}`, how: "На карту" };
    const upcoming = b.startsAt > now;
    return { ledgerId: l.id, at: l.createdAt, who: b.patientId, amountKopecks: l.amountKopecks,
      what: `Предоплата · ${upcoming ? b.service.title : svc}${upcoming ? `, ${dateNum(localDay(b.startsAt))}` : ""}`,
      how: l.channel === "cash" ? "Наличные, регистратура" : "Онлайн · карта или СБП" };
  });

  const [acc] = await sql<{ email: string | null; notifyRemind: boolean; notifyResults: boolean; notifyEmail: boolean }[]>`
    select email, notify_remind, notify_results, notify_email from patient_accounts where phone = ${phone}`;
  const consentRows = await sql<{ kind: string; acceptedAt: Date; publishedAt: Date; patientId: number }[]>`
    select distinct on (c.kind, b.patient_id) c.kind, bc.accepted_at, c.published_at, b.patient_id
    from booking_consents bc join consents c on c.id = bc.consent_id join bookings b on b.id = bc.booking_id
    where b.patient_id in ${sql(ids)} order by c.kind, b.patient_id, bc.accepted_at desc`;
  const d = (x: Date) => ru(localDay(x));
  const consents = consentRows
    .sort((a, b) => (a.kind === "personal_data" ? 0 : 1) - (b.kind === "personal_data" ? 0 : 1) || Number(b.patientId === owner.id) - Number(a.patientId === owner.id))
    .map(c => {
      const person = people.find(p => p.id === c.patientId);
      if (c.kind === "prepay_terms") return { title: "Условия предоплаты", sub: `Приняты ${d(c.acceptedAt)}`, href: "/dokumenty/predoplata" };
      return { href: "/dokumenty/soglasie-pd", title: person && !person.isOwner ? `Согласие на обработку данных ребёнка · ${person.name}` : "Согласие на обработку персональных данных",
        sub: `Подписано онлайн ${d(c.acceptedAt)} · ред. от ${d(c.publishedAt)}` };
    })
    .filter((c, i, all) => all.findIndex(x => x.title === c.title) === i);

  // Справку для вычета готовим за неделю (по закону — до 30 дней): срок показываем в кабинете.
  const [tax] = await sql<{ at: Date }[]>`select created_at as at from cabinet_requests where phone = ${phone} and kind = 'tax'
    and created_at >= ${`${today.slice(0, 4)}-01-01`} order by created_at desc limit 1`;

  const withNext = docs.filter(x => x.who === owner.id && x.kind === "concl" && x.body.next).sort((a, b) => b.issuedOn.localeCompare(a.issuedOn))[0];
  let recommendation: CabinetData["recommendation"] = null;
  if (withNext?.body.next) {
    const n = withNext.body.next;
    const booked = visits.some(v => v.kind === "up" && v.doctorId === n.doctorId && v.serviceId === n.serviceId);
    if (!booked) recommendation = { text: n.text, who: `${withNext.author} · из заключения от ${dateNum(withNext.issuedOn)}`, doctorId: n.doctorId, serviceId: n.serviceId };
  }

  return {
    owner, people, visits, docs, payments,
    account: { email: acc?.email ?? null, notifyRemind: acc?.notifyRemind ?? true, notifyResults: acc?.notifyResults ?? true, notifyEmail: acc?.notifyEmail ?? false },
    consents, taxRequested: !!tax, taxReadyOn: tax ? localDay(new Date(tax.at.getTime() + TAX_READY_DAYS * 86_400_000)) : null, recommendation,
  };
}
