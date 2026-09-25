import Link from "next/link";
import { notFound } from "next/navigation";
import { app } from "@/lib/app";
import { getBookingView, type BookingView } from "@/lib/queries/booking-view";
import { localDay } from "@/domain/time";
import { rub, dayLong, dateNum, hhmmOf, splitName } from "@/lib/format";
import { Main } from "@/components/site/stepper";
import { MyBookingActions } from "@/components/booking/my-booking-actions";
import { payNowAction } from "../../zapis/[token]/actions";
import { cancelMyBookingAction } from "./actions";

const card: React.CSSProperties = { background: "var(--color-bg)", padding: 16, display: "flex", flexDirection: "column", gap: 6, border: "1px solid var(--color-divider)", borderRadius: 24 };
const cardK: React.CSSProperties = { fontSize: 11, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--color-neutral-700)" };

function states(v: BookingView, today: string) {
  const at = (d: Date) => `${dateNum(localDay(d))} в ${hhmmOf(d)}`;
  const deadline = v.status === "held" ? v.holdUntil : v.payDeadline;
  const when = `${dayLong(localDay(v.startsAt), today)}, ${hhmmOf(v.startsAt)}`;
  const prepay = rub(v.prepayKopecks);
  const paid = v.money !== "unpaid";
  switch (v.status) {
    case "cancelled":
      return { state: "Отменена", stateSub: v.cancelledBy === "clinic" ? `Клиника отменила запись${v.cancelReason ? `: ${v.cancelReason}` : ""}` : `Вы отменили запись ${v.cancelledAt ? at(v.cancelledAt) : ""}`, color: "var(--color-danger)",
        money: paid ? (v.money === "refunded" ? `${prepay} возвращены` : "Возврат оформлен") : "Не вносилась",
        moneySub: paid ? `${prepay} вернутся на карту. Срок зачисления зависит от вашего банка. Чек возврата — в СМС.` : "" };
    case "confirmed":
      return { state: "Подтверждена", stateSub: `Ждём вас ${when}`, color: "var(--color-text)", money: `${prepay} получены`, moneySub: "Чек предоплаты отправлен в СМС · засчитается в стоимость" };
    case "claimed":
      return { state: "Оплата заявлена", stateSub: "Регистратура сверяет платёж", color: "var(--color-accent-700)", money: "Проверяется", moneySub: "Подтвердим по СМС" };
    case "held": case "pending":
      return { state: "Ждёт оплаты", stateSub: `Время закреплено за вами до ${deadline ? `${hhmmOf(deadline)} ${dayLong(localDay(deadline), today)}` : ""}`, color: "var(--color-accent-700)",
        money: "Не внесена", moneySub: v.status === "held" ? "Картой или по СБП по ссылке из СМС" : "Наличными в регистратуре или по ссылке из СМС" };
    case "arrived": return { state: "Пришёл, документы", stateSub: "Приём скоро начнётся", color: "var(--color-text)", money: `${prepay} получены`, moneySub: "засчитается в стоимость" };
    case "done": return { state: "Приём состоялся", stateSub: when, color: "var(--color-text)", money: paid ? `${prepay} зачтены` : "—", moneySub: "в стоимость приёма" };
    case "no_show": return { state: "Неявка", stateSub: "Приём не состоялся", color: "var(--color-text)", money: paid ? "Предоплата у клиники" : "—", moneySub: paid ? "Позвоните в клинику, если нужен возврат" : "" };
    case "transferred": return { state: "Перенесена", stateSub: "Предоплата перешла на новую запись", color: "var(--color-neutral-700)", money: paid ? "Перенесена" : "—", moneySub: "" };
    case "expired": return { state: "Снята", stateSub: "Оплата не поступила в срок", color: "var(--color-danger)", money: paid ? "Будет возвращена" : "Не вносилась", moneySub: "" };
  }
}

export default async function MyBooking(props: PageProps<"/moya-zapis/[token]">) {
  const { token } = await props.params;
  const { sql, adapters, config } = app();
  const v = await getBookingView(sql, adapters.clock, token);
  if (!v) notFound();
  const now = adapters.clock.now();
  const today = localDay(now);
  const s = states(v, today);
  const when = `${dayLong(localDay(v.startsAt), today)}, ${hhmmOf(v.startsAt)}`;
  const { surname, given } = splitName(v.doctor.title);
  const live = ["held", "pending", "claimed", "confirmed"].includes(v.status);

  return (
    <Main>
      <section style={{ display: "flex", flexDirection: "column", gap: 24, maxWidth: 900 }}>
        <Link href="/kabinet" className="plain-link" style={{ cursor: "pointer", fontSize: 14, color: "var(--color-accent-700)" }}>← Личный кабинет</Link>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <span style={{ fontSize: 12, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--color-neutral-700)" }}>Моя запись · № {v.id}</span>
          <h2 style={{ margin: 0, fontSize: "var(--h2-size)", letterSpacing: "-0.025em", textDecoration: v.status === "cancelled" ? "line-through" : "none" }}>{when}</h2>
          <span style={{ fontSize: 16 }}>{v.service.title} · {surname} {given}, {(v.doctor.specialty ?? "").toLowerCase()}</span>
        </div>
        {v.transferredToToken && <Link href={`/moya-zapis/${v.transferredToToken}`} style={{ fontSize: 14, fontWeight: 700 }}>Открыть новую запись →</Link>}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(240px,1fr))", gap: 14, background: "transparent" }}>
          <div style={card}><span style={cardK}>Запись</span><span style={{ fontWeight: 800, fontSize: 20, color: s.color }}>{s.state}</span><span style={{ fontSize: 13, color: "var(--color-neutral-700)" }}>{s.stateSub}</span></div>
          <div style={card}><span style={cardK}>Предоплата</span><span style={{ fontWeight: 800, fontSize: 20 }}>{s.money}</span><span style={{ fontSize: 13, color: "var(--color-neutral-700)" }}>{s.moneySub}</span></div>
        </div>
        <div style={{ display: "flex", flexDirection: "column" }}>
          {[{ k: "Пациент", v: v.patientName }, { k: "Записал", v: v.recorder }, { k: "Услуга", v: `${v.service.title} · ${rub(v.priceKopecks)}` },
            ...(v.consentPending ? [{ k: "Согласие пациента", v: "ждём по ссылке из СМС" }] : []),
            { k: "Адрес", v: `${config.clinic.address} · ${config.clinic.addressNote}` }].map(r => (
            <div key={r.k} style={{ display: "grid", gridTemplateColumns: "180px minmax(0,1fr)", gap: 12, padding: "10px 0", borderBottom: "1px solid var(--color-divider)", fontSize: 14 }}>
              <span style={{ color: "var(--color-neutral-700)" }}>{r.k}</span><span style={{ fontWeight: 600 }}>{r.v}</span>
            </div>
          ))}
        </div>
        {live && (
          <MyBookingActions when={when} docShort={surname} paid={v.money === "advance_held"}
            paidMinutesAgo={v.paidAt ? (now.getTime() - v.paidAt.getTime()) / 60000 : null}
            rescheduleHref={v.canTransfer ? `/vrach/${v.doctorId}?svc=${v.serviceId}&perenos=${v.token}` : null}
            canPay={v.canPay && v.status !== "held"} prepayLabel={rub(v.prepayKopecks)}
            pay={payNowAction.bind(null, v.token, `/moya-zapis/${v.token}`)} cancel={cancelMyBookingAction.bind(null, v.token)} />
        )}
      </section>
    </Main>
  );
}
