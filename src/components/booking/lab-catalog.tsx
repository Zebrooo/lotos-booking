"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { plural, rub } from "@/lib/format";
import { labServicesQuery, MAX_LAB_SERVICES } from "@/lib/lab-pool";
import type { PublicLabService } from "@/lib/pricing/public";

type Props = {
  q: string;
  kind: string;
  category: string;
  categories: string[];
  availableAtHome: boolean;
  offset: number;
  total: number;
  items: PublicLabService[];
  selected: PublicLabService[];
};

const muted = "var(--color-neutral-700)";
const tx = "var(--color-text)";

export function LabCatalog(props: Props) {
  const router = useRouter();
  const [q, setQ] = useState(props.q);
  const [selected, setSelected] = useState(props.selected);
  const selectedIds = selected.map(item => item.id);
  const navigate = (patch: Record<string, string | number>) => {
    const params = new URLSearchParams({ q: props.q, kind: props.kind, category: props.category, home: props.availableAtHome ? "1" : "", offset: String(props.offset), services: labServicesQuery(selectedIds), ...patch } as Record<string, string>);
    router.push(`/analizy?${params.toString()}`);
  };
  const toggle = (item: PublicLabService) => {
    const next = selectedIds.includes(item.id) ? selected.filter(value => value.id !== item.id) : [...selected, item];
    setSelected(next);
    const params = new URLSearchParams(window.location.search);
    const ids = labServicesQuery(next.map(value => value.id));
    if (ids) params.set("services", ids); else params.delete("services");
    const search = params.toString();
    window.history.replaceState(window.history.state, "", `${window.location.pathname}${search ? `?${search}` : ""}${window.location.hash}`);
  };
  const price = selected.reduce((sum, item) => sum + item.priceKopecks, 0);
  const prepay = selected.reduce((sum, item) => sum + item.prepayKopecks, 0);
  const duration = selected.reduce((sum, item) => sum + item.durationMin, 0);
  const query = labServicesQuery(selectedIds);
  return (
    <section style={{ display: "flex", flexDirection: "column", gap: 22 }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 8, maxWidth: 760 }}>
        <h1 style={{ margin: 0, fontSize: "var(--h1-size)", lineHeight: 1.02, letterSpacing: "-0.03em" }}>Анализы и пакеты</h1>
        <p style={{ margin: 0, fontSize: 16, color: "var(--color-neutral-800)", textWrap: "pretty" }}>Найдите исследование по названию или коду. Можно выбрать несколько позиций и записаться на один визит.</p>
      </div>
      <form onSubmit={event => { event.preventDefault(); navigate({ q, offset: 0 }); }} style={{ display: "flex", gap: 8, flexWrap: "wrap", maxWidth: 900 }}>
        <input className="input" aria-label="Поиск анализа" value={q} onChange={event => setQ(event.target.value)} placeholder="Например, глюкоза или № 16" style={{ minHeight: 56, fontSize: 17, flex: "1 1 300px" }} />
        <button className="btn btn-primary" type="submit">Найти</button>
        {props.q && <button className="btn btn-secondary" type="button" onClick={() => { setQ(""); navigate({ q: "", offset: 0 }); }}>Сбросить</button>}
      </form>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
        {([["", "Все"], ["analysis", "Анализы"], ["complex", "Пакеты"]] as const).map(([value, label]) => (
          <button key={value} aria-pressed={props.kind === value} onClick={() => navigate({ kind: value, category: "", offset: 0 })}
            style={{ font: "inherit", fontSize: 14, padding: "8px 16px", cursor: "pointer", border: "1px solid var(--color-divider)", background: props.kind === value ? tx : "transparent", color: props.kind === value ? "var(--color-bg)" : tx, borderRadius: 999 }}>{label}</button>
        ))}
        <select className="input" aria-label="Категория исследования" value={props.category} onChange={event => navigate({ category: event.target.value, offset: 0 })} style={{ maxWidth: 300 }}>
          <option value="">Все категории</option>{props.categories.map(category => <option key={category} value={category}>{category}</option>)}
        </select>
        <label style={{ display: "flex", gap: 7, alignItems: "center", fontSize: 14 }}><input type="checkbox" checked={props.availableAtHome} onChange={event => navigate({ home: event.target.checked ? "1" : "", offset: 0 })} /> Доступно на дому</label>
      </div>
      {selected.length > 0 && (
        <aside aria-label="Выбранные анализы" style={{ background: "var(--color-surface)", padding: 20, borderRadius: 24, display: "flex", flexDirection: "column", gap: 14 }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", alignItems: "baseline" }}>
            <strong>{selected.length} {plural(selected.length, "позиция", "позиции", "позиций")} · {duration} минут</strong>
            <span><b style={{ fontSize: 22 }}>{rub(price)}</b> · предоплата {rub(prepay)}</span>
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {selected.map(item => <button key={item.id} type="button" onClick={() => toggle(item)} aria-label={`Убрать ${item.title}`} className="tag tag-outline" style={{ cursor: "pointer" }}>{item.title} ×</button>)}
          </div>
          <Link className="btn btn-primary" href={`/analizy/zapis?services=${query}`} style={{ alignSelf: "flex-start", padding: "12px 18px" }}>Выбрать время →</Link>
        </aside>
      )}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", borderBottom: "1px solid var(--color-divider)", paddingBottom: 8 }}>
        <span style={{ fontSize: 12, letterSpacing: "0.08em", textTransform: "uppercase", color: muted }}>{props.total} {plural(props.total, "позиция", "позиции", "позиций")}</span>
        <span style={{ fontSize: 12, color: muted }}>Цены в рублях</span>
      </div>
      {props.items.length === 0 && (
        <div style={{ padding: "24px 0", display: "flex", flexDirection: "column", gap: 6 }}>
          <span style={{ fontWeight: 800, fontSize: 20 }}>Ничего не нашли</span>
          <span style={{ color: muted }}>Проверьте название или сбросьте часть фильтров. На витрине показываются только опубликованные клиникой услуги.</span>
        </div>
      )}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(280px,1fr))", gap: 14 }}>
        {props.items.map(item => {
          const selected = selectedIds.includes(item.id);
          const disabled = !item.bookable || (!selected && selectedIds.length >= MAX_LAB_SERVICES);
          return (
            <article key={item.id} style={{ background: "var(--color-bg)", padding: 18, display: "flex", flexDirection: "column", gap: 12, border: `1px solid ${selected ? "var(--color-accent)" : "var(--color-divider)"}`, borderRadius: 24 }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start" }}>
                <span style={{ fontSize: 11, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--color-accent-700)" }}>{item.kind === "complex" ? "Пакет анализов" : "Анализ"}</span>
                {item.code && <span style={{ fontSize: 12, color: muted, whiteSpace: "nowrap" }}>№ {item.code}</span>}
              </div>
              <h2 style={{ margin: 0, fontSize: 18, lineHeight: 1.25 }}>{item.title}</h2>
              {item.category && <span style={{ fontSize: 13, color: muted }}>{item.category}</span>}
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", fontSize: 12, color: muted }}>
                {item.deadlineDays != null && <span className="tag tag-outline">Срок: {item.deadlineDays} {plural(item.deadlineDays, "день", "дня", "дней")}</span>}
                {item.availableAtHome && <span className="tag tag-outline">Доступно на дому</span>}
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, marginTop: "auto", borderTop: "1px solid var(--color-divider)", paddingTop: 12 }}>
                <b style={{ fontSize: 20, whiteSpace: "nowrap" }}>{rub(item.priceKopecks)}</b>
                {item.sourceUrl && <Link className="plain-link" href={item.sourceUrl} target="_blank" style={{ fontSize: 13, color: "var(--color-accent-700)" }}>Подробнее ↗</Link>}
              </div>
              <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 14, fontWeight: 700, cursor: disabled ? "default" : "pointer", opacity: item.bookable ? 1 : 0.6 }}>
                <input type="checkbox" checked={selected} disabled={disabled} onChange={() => toggle(item)} />
                {!item.bookable ? "Онлайн-запись недоступна" : selected ? "Выбрано" : selectedIds.length >= MAX_LAB_SERVICES ? `Не более ${MAX_LAB_SERVICES} позиций` : "Выбрать"}
              </label>
            </article>
          );
        })}
      </div>
      <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
        {props.offset > 0 && <button className="btn btn-secondary" onClick={() => navigate({ offset: Math.max(0, props.offset - 24) })}>← Назад</button>}
        {props.offset + props.items.length < props.total && <button className="btn btn-secondary" onClick={() => navigate({ offset: props.offset + 24 })}>Дальше →</button>}
      </div>
    </section>
  );
}
