"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { rub } from "@/lib/format";
import type { ClinicService, ExternalService } from "@/lib/pricing/pricing";
import { addExternalServiceAction, importPricesAction, resetServiceToExternalAction, updateServiceMarkupAction, updateServicePriceAction } from "@/app/crm/pricing-actions";

type Run = { status: string; totalProducts: number; analysesCount: number; complexesCount: number; finishedAt: string | null; error: string | null };
type Props = {
  view: "clinic" | "external";
  q: string;
  kind: string;
  group: string;
  status: string;
  source: string;
  category: string;
  availableAtHome: boolean;
  categories: string[];
  offset: number;
  services: ClinicService[];
  external: { total: number; items: ExternalService[] };
  run: Run | null;
};

const tx = "var(--color-text)", muted = "var(--color-neutral-700)";
const kicker: React.CSSProperties = { fontSize: 11, letterSpacing: "0.08em", textTransform: "uppercase", color: muted };
const card: React.CSSProperties = { background: "var(--color-surface)", borderRadius: 20, padding: 16, display: "flex", flexDirection: "column", gap: 12 };

export function PricingView(props: Props) {
  const router = useRouter();
  const [q, setQ] = useState(props.q);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const navigate = (patch: Record<string, string | number>) => {
    const params = new URLSearchParams({ view: props.view, q: props.q, kind: props.kind, group: props.group, status: props.status,
      source: props.source, category: props.category, home: props.availableAtHome ? "1" : "", offset: String(props.offset), ...patch } as Record<string, string>);
    router.push(`/crm/tseny?${params.toString()}`);
  };
  const importNow = () => start(async () => {
    setMessage(null);
    const result = await importPricesAction();
    setMessage(result.ok ? `Каталог обновлён: ${props.run?.totalProducts ?? "новые"} позиций` : result.error);
    router.refresh();
  });
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      <section style={{ ...card, flexDirection: "row", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between" }}>
        <div>
          <span style={kicker}>Источник цен</span>
          <div style={{ fontSize: 15, marginTop: 4 }}><b>INVITRO · Еманжелинск</b></div>
          <div style={{ fontSize: 13, color: muted, marginTop: 4 }}>
            {props.run ? `${props.run.status === "success" ? "Последний импорт" : "Последняя попытка"}: ${props.run.totalProducts} позиций — ${props.run.analysesCount} анализов, ${props.run.complexesCount} комплексов` : "Каталог ещё не импортирован"}
            {props.run?.finishedAt ? ` · ${new Date(props.run.finishedAt).toLocaleString("ru-RU")}` : ""}
          </div>
          {props.run?.error && <div role="alert" style={{ fontSize: 13, color: "var(--color-danger)", marginTop: 4 }}>{props.run.error}</div>}
        </div>
        <button className="btn btn-primary" disabled={pending} onClick={importNow}>{pending ? "Работаем…" : "Обновить каталог INVITRO"}</button>
      </section>
      {message && <div role="status" style={{ ...card, color: message.includes("ошибка") || message.includes("HTTP") ? "var(--color-danger)" : tx }}>{message}</div>}

      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        <button className={props.view === "clinic" ? "btn btn-primary" : "btn btn-secondary"} onClick={() => navigate({ view: "clinic", offset: 0 })}>Услуги</button>
        <button className={props.view === "external" ? "btn btn-primary" : "btn btn-secondary"} onClick={() => navigate({ view: "external", offset: 0 })}>Каталог INVITRO</button>
      </div>
      {props.view === "clinic" && (
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }} aria-label="Раздел услуг">
          {([["", "Все услуги"], ["doctors", "Услуги врачей"], ["analysis", "Анализы"], ["package", "Пакеты анализов"]] as const).map(([value, label]) => (
            <button key={value} aria-pressed={props.group === value} className={props.group === value ? "btn btn-primary" : "btn btn-secondary"} onClick={() => navigate({ group: value, offset: 0 })}>{label}</button>
          ))}
        </div>
      )}

      <form style={{ display: "flex", gap: 8, flexWrap: "wrap" }} onSubmit={event => { event.preventDefault(); navigate({ q, offset: 0 }); }}>
        <input className="input" aria-label="Поиск по каталогу" value={q} onChange={event => setQ(event.target.value)} placeholder={props.view === "clinic" ? "Услуга клиники" : "Название, код или категория"} style={{ maxWidth: 420, flex: "1 1 280px" }} />
        <button className="btn btn-secondary" type="submit">Найти</button>
        {props.q && <button className="btn btn-secondary" type="button" onClick={() => { setQ(""); navigate({ q: "", offset: 0 }); }}>Сбросить</button>}
        {props.view === "clinic" ? (
          <>
            <select className="input" aria-label="Статус услуги" value={props.status} onChange={event => navigate({ status: event.target.value, offset: 0 })} style={{ maxWidth: 180 }}>
              <option value="">Любой статус</option><option value="active">В прайсе</option><option value="inactive">Выключены</option>
            </select>
            <select className="input" aria-label="Источник услуги" value={props.source} onChange={event => navigate({ source: event.target.value, offset: 0 })} style={{ maxWidth: 180 }}>
              <option value="">Любой источник</option><option value="invitro">Связаны с INVITRO</option><option value="own">Собственные</option>
            </select>
          </>
        ) : (
          <>
            <select className="input" aria-label="Тип позиции" value={props.kind} onChange={event => navigate({ kind: event.target.value, category: "", offset: 0 })} style={{ maxWidth: 180 }}>
              <option value="">Анализы и пакеты</option><option value="analysis">Только анализы</option><option value="complex">Только пакеты</option>
            </select>
            <select className="input" aria-label="Категория" value={props.category} onChange={event => navigate({ category: event.target.value, offset: 0 })} style={{ maxWidth: 260 }}>
              <option value="">Все категории</option>{props.categories.map(category => <option key={category} value={category}>{category}</option>)}
            </select>
            <label style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 13 }}><input type="checkbox" checked={props.availableAtHome} onChange={event => navigate({ home: event.target.checked ? "1" : "", offset: 0 })} /> Доступно на дому</label>
          </>
        )}
      </form>

      {props.view === "clinic" ? <ClinicList services={props.services} onRefresh={() => router.refresh()} /> : <ExternalList {...props} onRefresh={() => router.refresh()} />}
      {props.view === "external" && (
        <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <span style={{ fontSize: 13, color: muted }}>Показано {props.external.items.length} из {props.external.total}</span>
          {props.offset > 0 && <button className="btn btn-secondary" onClick={() => navigate({ offset: Math.max(0, props.offset - 50) })}>← Назад</button>}
          {props.offset + props.external.items.length < props.external.total && <button className="btn btn-secondary" onClick={() => navigate({ offset: props.offset + 50 })}>Дальше →</button>}
        </div>
      )}
    </div>
  );
}

function ClinicList({ services, onRefresh }: { services: ClinicService[]; onRefresh: () => void }) {
  if (services.length === 0) return <div style={card}>Услуги не найдены. Добавьте позицию из каталога INVITRO или измените поиск.</div>;
  return <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>{services.map(service => <ClinicRow key={service.id} service={service} onRefresh={onRefresh} />)}</div>;
}

function ClinicRow({ service, onRefresh }: { service: ClinicService; onRefresh: () => void }) {
  const [price, setPrice] = useState((service.priceKopecks / 100).toString());
  const [prepay, setPrepay] = useState((service.prepayKopecks / 100).toString());
  const [duration, setDuration] = useState(String(service.durationMin));
  const [markup, setMarkup] = useState(service.markupBp == null ? "0" : (service.markupBp / 100).toString());
  const [active, setActive] = useState(service.active);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const money = (value: string) => Math.round(Number(value.replace(",", ".")) * 100);
  const save = () => start(async () => {
    setError(null);
    const result = await updateServicePriceAction({ serviceId: service.id, priceKopecks: money(price), prepayKopecks: money(prepay), durationMin: Number(duration), active });
    if (result.ok) onRefresh(); else setError(result.error);
  });
  const applyMarkup = () => start(async () => {
    setError(null);
    const markupBp = money(markup);
    const result = await updateServiceMarkupAction(service.id, markupBp);
    if (result.ok) {
      if (service.sourcePriceKopecks != null) setPrice((Math.round(service.sourcePriceKopecks * (10000 + markupBp) / 10000) / 100).toString());
      onRefresh();
    } else setError(result.error);
  });
  const reset = () => start(async () => {
    const result = await resetServiceToExternalAction(service.id);
    if (result.ok) {
      setMarkup("0");
      if (service.sourcePriceKopecks != null) setPrice((service.sourcePriceKopecks / 100).toString());
      onRefresh();
    } else setError(result.error);
  });
  return (
    <section style={card}>
      <div style={{ display: "flex", gap: 8, alignItems: "flex-start", flexWrap: "wrap" }}>
        <div style={{ flex: "1 1 420px" }}><b>{service.title}</b><div style={{ fontSize: 12, color: muted, marginTop: 3 }}>
          {service.externalKind === "complex" ? "пакет анализов · INVITRO" : service.externalKind === "analysis" ? "анализ · INVITRO" : service.kind === "analysis" ? "анализ · собственная услуга" : `${service.kind} · собственная услуга`}
          {service.markupBp == null && service.externalId ? " · ручная цена" : ""}
        </div></div>
        <label style={{ fontSize: 13, display: "flex", gap: 6, alignItems: "center" }}><input type="checkbox" checked={active} onChange={event => setActive(event.target.checked)} /> Показывать в прайсе</label>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(140px,1fr))", gap: 10 }}>
        <label className="field">Цена, ₽<input className="input" inputMode="decimal" value={price} onChange={event => setPrice(event.target.value)} /></label>
        <label className="field">Предоплата, ₽<input className="input" inputMode="decimal" value={prepay} onChange={event => setPrepay(event.target.value)} /></label>
        <label className="field">Длительность, мин<input className="input" inputMode="numeric" value={duration} onChange={event => setDuration(event.target.value.replace(/\D/g, ""))} /></label>
        {service.externalId && <label className="field">Наценка на INVITRO, %<input className="input" inputMode="decimal" value={markup} onChange={event => setMarkup(event.target.value)} /></label>}
      </div>
      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <button className="btn btn-primary" disabled={pending} onClick={save}>Сохранить</button>
        {service.externalId && <button className="btn btn-secondary" disabled={pending} onClick={applyMarkup}>Применить наценку</button>}
        {service.sourcePriceKopecks != null && <button className="btn btn-secondary" disabled={pending} onClick={reset}>Без наценки: {rub(service.sourcePriceKopecks)}</button>}
        {service.sourceUrl && <Link className="plain-link" href={service.sourceUrl} target="_blank" style={{ fontSize: 13 }}>Источник ↗</Link>}
        {error && <span role="alert" style={{ fontSize: 13, color: "var(--color-danger)" }}>{error}</span>}
      </div>
      {service.externalId && <div style={{ fontSize: 12, color: muted }}>Наценка считается от цены источника и применяется после каждого импорта. «Сохранить» фиксирует ручную цену и отключает этот пересчёт.</div>}
    </section>
  );
}

function ExternalList(props: Props & { onRefresh: () => void }) {
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const add = (externalId: string) => start(async () => {
    setError(null);
    const result = await addExternalServiceAction(externalId);
    if (!result.ok) setError(result.error);
    props.onRefresh();
  });
  if (props.external.items.length === 0) return <div style={card}>Позиции не найдены. Обновите каталог или измените фильтр.</div>;
  return (
    <>
      {error && <div role="alert" style={{ ...card, color: "var(--color-danger)" }}>{error}</div>}
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {props.external.items.map(item => (
          <section key={item.externalId} style={{ ...card, display: "grid", gridTemplateColumns: "minmax(0,1fr) auto", alignItems: "center", gap: 12 }}>
            <div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "baseline" }}><b>{item.title}</b><span style={{ fontSize: 12, color: muted }}>№ {item.code}</span></div>
              <div style={{ fontSize: 12, color: muted, marginTop: 4 }}>{item.kind === "analysis" ? "Анализ" : "Пакет анализов"} · {item.category}{item.deadlineDays != null ? ` · ${item.deadlineDays} дн.` : ""}{item.availableAtHome ? " · доступно на дому" : ""}</div>
              <Link className="plain-link" href={item.sourceUrl} target="_blank" style={{ fontSize: 12, marginTop: 5, display: "inline-block" }}>Страница INVITRO ↗</Link>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8, alignItems: "flex-end" }}>
              <b style={{ whiteSpace: "nowrap" }}>{rub(item.priceKopecks)}</b>
              {item.serviceId ? <span style={{ fontSize: 12, color: muted }}>Уже в услугах</span> : <button className="btn btn-secondary" disabled={pending} onClick={() => add(item.externalId)}>Добавить в услуги</button>}
            </div>
          </section>
        ))}
      </div>
    </>
  );
}
