import Link from "next/link";
import { notFound } from "next/navigation";
import { app } from "@/lib/app";
import { getBookingView, type BookingView } from "@/lib/queries/booking-view";
import { formatDateTime, formatTime, formatRub, cancelOutcomeText, RETAIN_WORDING } from "@/lib/texts";
import { ArrivalNotice } from "@/components/arrival-notice";
import { ui, first } from "@/components/ui";
import { payAction, cancelAction } from "./actions";
import { RefreshWhileWaiting } from "./refresh";

const BADGE: Record<string, string> = {
  held: "bg-amber-100 text-amber-900", confirmed: "bg-teal-100 text-teal-900", done: "bg-slate-100 text-slate-700",
  no_show: "bg-slate-100 text-slate-700", cancelled: "bg-red-100 text-red-800", transferred: "bg-slate-100 text-slate-700",
  expired: "bg-slate-100 text-slate-700",
};

export default async function MyBooking(props: PageProps<"/moya-zapis/[token]">) {
  const { token } = await props.params;
  const sp = await props.searchParams;
  const { sql, adapters } = app();
  const v = await getBookingView(sql, adapters.clock, token);
  if (!v) notFound();
  const expiredByTime = v.status === "held" && !v.canPay;

  return (
    <div className="space-y-6">
      {first(sp.pereneseno) && <Flash>Запись перенесена. Предоплата перешла на новое время.</Flash>}
      {first(sp.oplata) === "oshibka" && <Flash tone="warn">Не удалось перейти к оплате. Попробуйте ещё раз через минуту.</Flash>}
      {first(sp.oplata) === "otkaz" && v.canPay && <Flash tone="warn">Оплата не прошла. Можно попробовать ещё раз, пока время закреплено за вами.</Flash>}

      <div className="flex flex-wrap items-center gap-3">
        <h1 className={ui.h1}>Ваша запись</h1>
        <span className={`rounded-full px-3 py-1 text-sm font-medium ${BADGE[v.status]}`}>{expiredByTime ? "Срок оплаты истёк" : v.statusLabel}</span>
      </div>

      <dl className={`${ui.card} grid gap-4 sm:grid-cols-2`}>
        <Item label="Услуга">{v.service.title}</Item>
        <Item label="Врач">{v.doctor.title}{v.doctor.specialty ? `, ${v.doctor.specialty}` : ""}</Item>
        <Item label="Время">{formatDateTime(v.startsAt)}</Item>
        <Item label="Пациент">{v.patientName}</Item>
      </dl>

      <StatusBlock v={v} expiredByTime={expiredByTime} />

      {v.canCancel && (
        <details className={`${ui.card} group`}>
          <summary className="cursor-pointer font-medium text-slate-800">Отменить запись</summary>
          <div className="mt-3 space-y-3">
            <p className="text-slate-700">{cancelOutcomeText(v.cancelPreview, v.prepayKopecks)}</p>
            <form action={cancelAction.bind(null, v.token)}>
              <button className={`${ui.btn} ${ui.danger}`}>Да, отменить запись</button>
            </form>
          </div>
        </details>
      )}
    </div>
  );
}

function StatusBlock({ v, expiredByTime }: { v: BookingView; expiredByTime: boolean }) {
  if (v.status === "held" && v.canPay) {
    return (
      <div className={`${ui.card} space-y-3 border-amber-300`}>
        <RefreshWhileWaiting untilIso={v.holdUntil!.toISOString()} />
        <p>Время закреплено за вами до <b>{formatTime(v.holdUntil!)}</b>. Запись подтвердится после предоплаты {formatRub(v.prepayKopecks)}.</p>
        <p className={ui.muted}>Если вы уже оплатили, страница обновится сама в течение минуты.</p>
        <form action={payAction.bind(null, v.token)}>
          <button className={`${ui.btn} ${ui.primary}`}>Оплатить {formatRub(v.prepayKopecks)}</button>
        </form>
      </div>
    );
  }
  if (expiredByTime || v.status === "expired") {
    return (
      <div className={`${ui.card} space-y-2`}>
        <p>Оплата не поступила вовремя, и время освободилось. Если деньги всё же списались, клиника вернёт их.</p>
        <Link className={`${ui.btn} ${ui.primary}`} href={`/zapis/${v.serviceId}?doctor=${v.doctorId}`}>Записаться снова</Link>
      </div>
    );
  }
  if (v.status === "confirmed") {
    return (
      <div className="space-y-4">
        <ArrivalNotice minutes={v.arriveEarlyMinutes} />
        {v.service.prepNote && <p className="rounded-xl border border-sky-200 bg-sky-50 p-3 text-sm text-sky-900"><b>Подготовка. </b>{v.service.prepNote}</p>}
        <p className={ui.muted}>Предоплата {formatRub(v.prepayKopecks)} получена и будет засчитана в стоимость приёма. Чек и напоминание придут на {v.emailMasked}.</p>
        {v.canTransfer ? (
          <Link className={`${ui.btn} ${ui.secondary}`} href={`/moya-zapis/${v.token}/perenos`}>Перенести на другое время</Link>
        ) : (
          <p className={ui.muted}>Перенести запись теперь можно по телефону клиники.</p>
        )}
      </div>
    );
  }
  if (v.status === "cancelled") {
    const text = v.money === "refunded" ? `Предоплата ${formatRub(v.prepayKopecks)} возвращена.`
      : v.refundPending ? `Возврат предоплаты ${formatRub(v.prepayKopecks)} в обработке. Срок зачисления зависит от банка.`
      : v.money === "retained" ? `Предоплата ${formatRub(v.prepayKopecks)} ${RETAIN_WORDING}.`
      : "Запись отменена.";
    return <p className={ui.card}>{text}</p>;
  }
  if (v.status === "transferred") {
    return (
      <p className={ui.card}>
        Запись перенесена.{" "}
        {v.transferredToToken && <Link className={ui.link} href={`/moya-zapis/${v.transferredToToken}`}>Открыть новую запись</Link>}
      </p>
    );
  }
  return <p className={ui.card}>{v.status === "done" ? "Приём состоялся. Спасибо, что выбрали нас." : "Приём не состоялся."}</p>;
}

function Item({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className={ui.muted}>{label}</dt>
      <dd className="font-medium">{children}</dd>
    </div>
  );
}

function Flash({ children, tone = "ok" }: { children: React.ReactNode; tone?: "ok" | "warn" }) {
  const cls = tone === "ok" ? "border-teal-300 bg-teal-50 text-teal-900" : "border-amber-300 bg-amber-50 text-amber-900";
  return <p role="status" className={`rounded-xl border p-3 text-sm ${cls}`}>{children}</p>;
}
