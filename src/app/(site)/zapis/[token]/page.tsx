import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { app } from "@/lib/app";
import { getBookingView } from "@/lib/queries/booking-view";
import { loadSettings } from "@/lib/usecases/settings";
import { localDay } from "@/domain/time";
import { rub, dayLong, hhmmOf, splitName, reminderLabel } from "@/lib/format";
import { first } from "@/lib/params";
import { Stepper, Main } from "@/components/site/stepper";
import { ArrivalWarning } from "@/components/booking/arrival-warning";
import { RefreshWhileWaiting } from "@/components/common/refresh";
import { payNowAction } from "./actions";

export default async function Done(props: PageProps<"/zapis/[token]">) {
  const { token } = await props.params;
  const sp = await props.searchParams;
  const { sql, adapters } = app();
  const v = await getBookingView(sql, adapters.clock, token);
  if (!v) notFound();
  if (!["held", "pending", "claimed", "confirmed"].includes(v.status)) redirect(`/moya-zapis/${token}`);
  const now = adapters.clock.now();
  const today = localDay(now);
  const settings = await loadSettings(sql);
  const paid = v.status === "confirmed";
  const deadline = v.status === "held" ? v.holdUntil : v.payDeadline;
  const deadlineLabel = deadline ? `${hhmmOf(deadline)} ${dayLong(localDay(deadline), today)}` : "";
  const { surname, given } = splitName(v.doctor.title);
  const remind = reminderLabel({ now, startsAt: v.startsAt });
  const kicker = paid ? `Запись подтверждена · № ${v.id}` : v.status === "held" ? `Ждём оплату · № ${v.id}` : `Время забронировано · № ${v.id}`;
  const facts = [
    { k: "Пациент", v: v.patientName }, { k: "Услуга", v: v.service.title }, { k: "Стоимость", v: rub(v.priceKopecks) },
    { k: "Предоплата", v: paid ? `${rub(v.prepayKopecks)} внесено` : `${rub(v.prepayKopecks)} до ${deadlineLabel}` },
    ...(v.consentPending ? [{ k: "Согласие пациента", v: "ждём по СМС" }] : []),
  ];

  return (
    <>
      <Stepper step={4} />
      <Main>
        <section style={{ display: "flex", flexDirection: "column", gap: 28, maxWidth: 900 }}>
          {v.status === "held" && v.holdUntil && <RefreshWhileWaiting untilIso={v.holdUntil.toISOString()} />}
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <span style={{ fontSize: 12, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--color-accent-700)" }}>{first(sp.pereneseno) ? `Запись перенесена · № ${v.id}` : kicker}</span>
            <h1 style={{ margin: 0, fontSize: "var(--h1-size)", lineHeight: 1.02, letterSpacing: "-0.03em", textWrap: "balance" }}>{dayLong(localDay(v.startsAt), today)}, {hhmmOf(v.startsAt)}</h1>
            <span style={{ fontSize: 17 }}>{v.service.title} · {surname} {given}, {(v.doctor.specialty ?? "").toLowerCase()}</span>
          </div>
          {!paid && v.canPay && (
            <div style={{ border: "1px solid var(--color-neutral-300)", padding: 18, display: "flex", flexWrap: "wrap", gap: 16, justifyContent: "space-between", alignItems: "center", borderRadius: 24 }}>
              <div style={{ display: "flex", flexDirection: "column", gap: 4, maxWidth: 520 }}>
                <span style={{ fontWeight: 800, fontSize: 18 }}>Внесите {rub(v.prepayKopecks)} до {deadlineLabel}</span>
                <span style={{ fontSize: 14, textWrap: "pretty" }}>{v.status === "held" ? "Картой или по СБП. Если не оплатить в срок, время освободится для других пациентов." : "Наличными в регистратуре или картой по ссылке из СМС. Если не оплатить в срок, время освободится для других пациентов."}</span>
                {first(sp.oplata) === "oshibka" && <span style={{ fontSize: 13, fontWeight: 600, color: "var(--color-danger)" }}>Не удалось перейти к оплате. Попробуйте ещё раз через минуту.</span>}
              </div>
              <form action={payNowAction.bind(null, v.token, `/zapis/${v.token}`)}>
                <button className="btn btn-primary" style={{ padding: "12px 16px", justifyContent: "space-between", minWidth: 200 }}>Оплатить сейчас<span>→</span></button>
              </form>
            </div>
          )}
          <ArrivalWarning minutes={settings.arriveEarlyMinutes} restLabel={rub(v.priceKopecks - v.prepayKopecks)} />
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(200px,1fr))", gap: 14, background: "transparent" }}>
            {facts.map(x => (
              <div key={x.k} style={{ background: "var(--color-bg)", padding: 14, display: "flex", flexDirection: "column", gap: 4, border: "1px solid var(--color-divider)", borderRadius: 24 }}>
                <span style={{ fontSize: 11, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--color-neutral-700)" }}>{x.k}</span>
                <span style={{ fontWeight: 800, fontSize: 17 }}>{x.v}</span>
              </div>
            ))}
          </div>
          <span style={{ fontSize: 14, color: "var(--color-neutral-800)" }}>{remind ? `Напомним по СМС ${remind}. ` : ""}Отменить или перенести запись можно в любой момент на странице «Моя запись» — ссылка в СМС.</span>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <Link href={`/moya-zapis/${v.token}`} className="btn btn-primary" style={{ padding: "14px 16px", minWidth: 220, justifyContent: "space-between" }}>Моя запись<span>→</span></Link>
            <Link href="/" className="btn btn-secondary" style={{ padding: "14px 16px" }}>Записать ещё кого-то</Link>
          </div>
        </section>
      </Main>
    </>
  );
}
