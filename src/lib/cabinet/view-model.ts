// Подписи личного кабинета — всё, что прототип считал в cabVals(), только из
// настоящих данных. Результат сериализуемый: клиент получает готовые строки.
import { localDay } from "@/domain/time";
import { rub, dateNum, hhmmOf, wdShort, monShort, relName, plural, accusativeName } from "@/lib/format";
import { maskPhone } from "@/lib/forms/booking-v2";
import { REFUND_HOW, type CabinetData, type CabVisit, type CabDoc } from "./data";

export type VisitVM = {
  id: number; token: string; who: number; kind: CabVisit["kind"]; dnum: string; dmon: string; svc: string; line: string;
  whoName: string; stLabel: string; stBg: string; stFg: string; price: string; note: string | null;
  paid: boolean; payable: boolean; prepay: string; canCancel: boolean; rescheduleHref: string | null; bookAgainHref: string | null;
  docIds: number[]; nextWhen: string; payLabel: string; laterWhen: string; overviewLine: string; pendingLine: string; deadline: string;
  dialog: { when: string; line: string; rows: { k: string; v: string }[]; prep: string | null; cancelText: string };
};
export type DocVM = {
  id: number; who: number; kind: CabDoc["kind"]; title: string; typeLabel: string; typeBg: string; typeFg: string; isNew: boolean; proc: boolean;
  meta: string; whoName: string; note: string; noteColor: string; cta: string; ctaColor: string; processingWhen: string;
  dialog: { meta: { k: string; v: string }[]; sections: { k: string; v: string }[]; recs: string[];
    rows: { name: string; val: string; unit: string; ref: string; bad: boolean }[]; next: { text: string; href: string } | null };
};
export type CabinetVM = {
  greeting: string; people: { key: string; name: string; sub: string; initial: string }[];
  visits: VisitVM[]; docs: DocVM[];
  payments: { who: number; date: string; what: string; sub: string; subMobile: string; amount: string; amountColor: string; kopecks: number; receiptHref: string }[];
  payTotal: string; payYear: string; payTotalSubAll: string; taxRequested: boolean; taxDoneText: string | null;
  profileRows: { k: string; v: string }[]; email: string; notifs: { key: "notifyRemind" | "notifyResults" | "notifyEmail"; label: string; sub: string; on: boolean }[];
  family: { id: number; full: string; sub: string; initial: string; isOwner: boolean }[];
  consents: { title: string; sub: string; href: string }[];
  recommendation: { text: string; who: string; href: string } | null;
};

const TYPE: Record<CabDoc["kind"], { l: string; bg: string; fg: string }> = {
  concl: { l: "Заключение", bg: "var(--color-accent-100)", fg: "var(--color-accent-700)" },
  lab: { l: "Анализы", bg: "var(--color-success-100)", fg: "var(--color-success)" },
  study: { l: "Исследование", bg: "var(--color-surface)", fg: "var(--color-neutral-800)" },
};

export function cabinetViewModel(d: CabinetData, now: Date, clinic: { address: string }): CabinetVM {
  const today = localDay(now);
  const person = (id: number) => d.people.find(p => p.id === id);
  const firstName = (id: number) => person(id)?.name ?? "Пациент";
  const dl = (at: Date) => `${hhmmOf(at)} ${relName(localDay(at), today) || dateNum(localDay(at))}`;

  const visits: VisitVM[] = d.visits.map(v => {
    const day = localDay(v.startsAt);
    const up = v.kind === "up";
    const deadline = v.deadline ? dl(v.deadline) : "";
    const st = up
      ? (v.paid ? { l: "Подтверждена", bg: "var(--color-success-100)", fg: "var(--color-success)" }
        : v.status === "claimed" ? { l: "Оплата заявлена", bg: "var(--color-accent-100)", fg: "var(--color-accent-800)" }
        : { l: `Ждёт оплаты до ${deadline}`, bg: "var(--color-danger-100)", fg: "var(--color-danger)" })
      : v.kind === "done" ? { l: v.status === "no_show" ? "Неявка" : "Приём состоялся", bg: "var(--color-surface)", fg: "var(--color-neutral-800)" }
      : { l: v.status === "transferred" ? "Перенесена" : "Отменена", bg: "var(--color-surface)", fg: "var(--color-neutral-700)" };
    const spec = v.doctorSpec ? `, ${v.doctorSpec.toLowerCase()}` : "";
    const p = person(v.who);
    return {
      id: v.id, token: v.token, who: v.who, kind: v.kind, dnum: String(Number(day.slice(8, 10))),
      dmon: monShort(day) + (up ? ` · ${wdShort(day)}` : ""), svc: v.serviceTitle, line: `${v.doctorShort} · ${hhmmOf(v.startsAt)}`,
      whoName: firstName(v.who), stLabel: st.l, stBg: st.bg, stFg: st.fg, price: rub(v.priceKopecks), note: v.note,
      paid: v.paid, payable: v.canPay && v.status !== "claimed", prepay: rub(v.prepayKopecks), canCancel: v.canCancel,
      rescheduleHref: v.canTransfer && !v.isLab ? `/vrach/${v.doctorId}?svc=${v.serviceId}&perenos=${v.token}` : null,
      bookAgainHref: !up && !v.isLab ? `/vrach/${v.doctorId}?svc=${v.serviceId}` : null,
      docIds: v.docIds, deadline,
      nextWhen: `${dateNum(day)}, ${hhmmOf(v.startsAt)}`, payLabel: v.paid ? "Предоплата внесена" : `Оплатить до ${deadline}`,
      laterWhen: `${dateNum(day)}, ${wdShort(day)} · ${hhmmOf(v.startsAt)}`,
      overviewLine: `${v.serviceTitle} · ${v.doctorShort} · ${wdShort(day)}`, pendingLine: `${v.serviceTitle} · ${firstName(v.who)}`,
      dialog: {
        when: `${dateNum(day)}, ${wdShort(day)} · ${hhmmOf(v.startsAt)}`, line: `${v.serviceTitle} · ${v.doctorShort}${spec}`,
        rows: [{ k: "Пациент", v: p?.full ?? "—" }, { k: "Стоимость", v: rub(v.priceKopecks) },
          { k: "Предоплата", v: v.paid ? `${rub(v.prepayKopecks)} внесено — засчитается` : `${rub(v.prepayKopecks)}, оплатить до ${deadline}` },
          { k: "Адрес", v: clinic.address }],
        prep: v.prepNote,
        cancelText: !v.paid ? "Время освободится для других пациентов."
          : v.refundHow === "card" ? `Предоплата ${rub(v.prepayKopecks)} вернётся на карту. Срок зачисления зависит от банка.`
          : `Предоплата ${rub(v.prepayKopecks)} вернётся ${REFUND_HOW[v.refundHow]} — регистратура свяжется с вами.`,
      },
    };
  });

  const docs: DocVM[] = d.docs.map(x => {
    const T = TYPE[x.kind];
    const proc = !!(x.readyOn && x.readyOn > today);
    const bad = (x.body.rows ?? []).filter(r => r[4]).length;
    const note = proc ? `Готовится · будет ${dateNum(x.readyOn!)}`
      : x.kind === "lab" ? (bad ? `${bad} ${plural(bad, "показатель", "показателя", "показателей")} вне нормы` : "Все показатели в норме")
      : x.body.next ? x.body.next.text : `${(x.body.recs ?? []).length} ${plural((x.body.recs ?? []).length, "рекомендация", "рекомендации", "рекомендаций")}`;
    const noteColor = proc ? "var(--color-neutral-700)" : bad ? "var(--color-danger)" : x.kind === "lab" ? "var(--color-success)" : "var(--color-accent-700)";
    return {
      id: x.id, who: x.who, kind: x.kind, title: x.title, typeLabel: T.l, typeBg: T.bg, typeFg: T.fg, isNew: x.isNew, proc,
      meta: `${dateNum(x.issuedOn)} · ${x.author}`, whoName: firstName(x.who), note, noteColor,
      cta: proc ? "Пришлём СМС" : "Открыть →", ctaColor: proc ? "var(--color-neutral-600)" : "var(--color-accent)",
      processingWhen: x.readyOn ? dateNum(x.readyOn) : "",
      dialog: {
        meta: [{ k: "Дата", v: `${dateNum(x.issuedOn)} ${x.issuedOn.slice(0, 4)}` }, { k: x.kind === "lab" ? "Выполнено" : "Врач", v: x.author }, { k: "Пациент", v: person(x.who)?.full ?? "—" }],
        sections: (x.body.sections ?? []).map(([k, v]) => ({ k, v })), recs: x.body.recs ?? [],
        rows: (x.body.rows ?? []).map(r => ({ name: r[0], val: r[1], unit: r[2], ref: r[3], bad: r[4] === 1 })),
        next: x.body.next ? { text: x.body.next.text, href: `/vrach/${x.body.next.doctorId}?svc=${x.body.next.serviceId}` } : null,
      },
    };
  });

  const payments = d.payments.map(p => {
    const refund = p.amountKopecks < 0;
    const date = dateNum(localDay(p.at));
    return { who: p.who, date, what: p.what, sub: `${firstName(p.who)} · ${p.how}`, subMobile: `${date} · ${firstName(p.who)} · ${p.how}`,
      amount: `${refund ? "+ " : ""}${rub(Math.abs(p.amountKopecks))}`, amountColor: refund ? "var(--color-success)" : "var(--color-text)", kopecks: p.amountKopecks,
      receiptHref: `/kabinet/chek/${p.ledgerId}` };
  });
  const total = d.payments.reduce((a, p) => a + p.amountKopecks, 0);
  const owner = d.people.find(p => p.isOwner)!;
  const kids = d.people.filter(p => !p.isOwner);

  return {
    greeting: `Здравствуйте, ${d.owner.firstName}`,
    people: [{ key: "all", name: "Все", sub: d.people.map(p => p.name).join(" и "), initial: d.people.map(p => p.initial).join("").slice(0, 2) },
      ...d.people.map(p => ({ key: String(p.id), name: p.name, sub: p.sub, initial: p.initial }))],
    visits, docs, payments, payTotal: rub(total), payYear: today.slice(0, 4),
    payTotalSubAll: kids.length ? `За вас${kids.length > 1 ? ", " + kids.slice(0, -1).map(k => accusativeName(k.name)).join(", ") : ""} и ${accusativeName(kids[kids.length - 1]!.name)} · с учётом возвратов` : "С учётом возвратов",
    taxRequested: d.taxRequested,
    taxDoneText: d.taxReadyOn ? `✓ Заявка принята. Справка будет готова до ${dateNum(d.taxReadyOn)} — пришлём СМС, забрать можно в регистратуре.` : null,
    profileRows: [{ k: "ФИО", v: d.owner.fullName }, { k: "Дата рождения", v: owner.dob }, { k: "Телефон", v: maskPhone(d.owner.phone) }],
    email: d.account.email ?? "",
    notifs: [
      { key: "notifyRemind", label: "Напоминание о приёме", sub: "СМС накануне визита", on: d.account.notifyRemind },
      { key: "notifyResults", label: "Готовность результатов", sub: "СМС, когда появится заключение или анализ", on: d.account.notifyResults },
      { key: "notifyEmail", label: "Чеки на почту", sub: "Копия кассового чека на email", on: d.account.notifyEmail },
    ],
    family: [owner, ...kids].map(p => ({ id: p.id, full: p.full, sub: p.isOwner ? `Вы · ${p.dob}` : `${p.sub} · ${p.dob}`, initial: p.initial, isOwner: p.isOwner })),
    consents: d.consents,
    recommendation: d.recommendation ? { text: d.recommendation.text, who: d.recommendation.who, href: `/vrach/${d.recommendation.doctorId}?svc=${d.recommendation.serviceId}` } : null,
  };
}
