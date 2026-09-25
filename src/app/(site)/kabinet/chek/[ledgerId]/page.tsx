// Чек из вкладки «Платежи»: что пробили, на какую сумму и куда отправили.
// Фискальные реквизиты (ФН, ФД, ФП) приходят от кассы; до подключения
// настоящей кассы показываем номер из журнала отправки.
import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { app } from "@/lib/app";
import { currentPhone } from "@/lib/cabinet/session-view";
import { receiptOfPhone } from "@/lib/cabinet/actions";
import { positiveInt } from "@/lib/params";
import { localDay } from "@/domain/time";
import { rub, dateNum, hhmmOf } from "@/lib/format";
import { maskPhone } from "@/lib/forms/booking-v2";
import { Main } from "@/components/site/stepper";

export const metadata: Metadata = { title: "Чек · Лотос", robots: { index: false } };

const KIND = { advance: "Приход · аванс (предоплата)", settle: "Приход · зачёт аванса", refund: "Возврат прихода" } as const;
const STATUS = { sent: "Отправлен", pending: "Формируется", failed: "Ошибка кассы — регистратура пробьёт вручную" } as const;

export default async function Receipt(props: PageProps<"/kabinet/chek/[ledgerId]">) {
  const ledgerId = positiveInt((await props.params).ledgerId);
  const phone = await currentPhone();
  if (!phone) redirect("/kabinet");
  const { sql, config } = app();
  const r = ledgerId ? await receiptOfPhone(sql, phone, ledgerId) : null;
  if (!r) notFound();
  const to = [r.phone && `СМС на ${maskPhone(r.phone)}`, r.email && `почта ${r.email}`].filter(Boolean).join(" · ");
  const rows = [
    { k: "Операция", v: KIND[r.kind] },
    { k: "Услуга", v: `${r.serviceTitle}, приём ${dateNum(localDay(r.startsAt))} в ${hhmmOf(r.startsAt)}` },
    { k: "Пациент", v: r.patient },
    { k: "Дата чека", v: `${dateNum(localDay(r.createdAt))} ${localDay(r.createdAt).slice(0, 4)}, ${hhmmOf(r.createdAt)}` },
    { k: "Статус", v: STATUS[r.status] },
    ...(to ? [{ k: "Куда отправлен", v: to }] : []),
    ...(r.externalId ? [{ k: "Номер в кассе", v: r.externalId }] : []),
    { k: "Продавец", v: `${config.clinic.legalName} · ${config.clinic.address}` },
  ];
  return (
    <Main>
      <section style={{ display: "flex", flexDirection: "column", gap: 24, maxWidth: 560 }}>
        <Link href="/kabinet" className="plain-link" style={{ fontSize: 14, color: "var(--color-accent-700)" }}>← Личный кабинет</Link>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <span style={{ fontSize: 12, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--color-neutral-700)" }}>Кассовый чек</span>
          <h2 style={{ margin: 0, fontSize: "var(--h2-size)", letterSpacing: "-0.025em", color: r.kind === "refund" ? "var(--color-success)" : "var(--color-text)" }}>{r.kind === "refund" ? "+ " : ""}{rub(r.amountKopecks)}</h2>
        </div>
        <div style={{ display: "flex", flexDirection: "column", border: "1px solid var(--color-divider)", borderRadius: 24, padding: "4px 20px" }}>
          {rows.map((x, i) => (
            <div key={x.k} style={{ display: "flex", justifyContent: "space-between", gap: 16, padding: "12px 0", borderBottom: i < rows.length - 1 ? "1px solid var(--color-divider)" : 0, fontSize: 14 }}>
              <span style={{ color: "var(--color-neutral-700)" }}>{x.k}</span><span style={{ fontWeight: 600, textAlign: "right" }}>{x.v}</span>
            </div>
          ))}
        </div>
        <span style={{ fontSize: 13, color: "var(--color-neutral-700)", textWrap: "pretty" }}>Электронный чек с фискальными реквизитами приходит от кассы по СМС или на почту. Бумажную копию выдаст регистратура.</span>
      </section>
    </Main>
  );
}
