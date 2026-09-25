"use client";
// Поиск врача — экран «isSearch» прототипа «Запись (клиент)».
import { useState } from "react";
import { useRouter } from "next/navigation";
import { plural, rub } from "@/lib/format";

export type SearchDoctor = {
  id: number; surname: string; given: string; spec: string; hasGroup: boolean; nearest: string;
  services: { name: string; priceKopecks: number }[];
};

const SPEC_ORDER = ["Терапевт", "Кардиолог", "Эндокринолог", "Невролог", "Гинеколог", "Уролог", "Оториноларинголог", "Офтальмолог"];
const tx = "var(--color-text)";
const bg = "var(--color-bg)";

export function DoctorSearch({ doctors, reschedule }: { doctors: SearchDoctor[]; reschedule: string | null }) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [spec, setSpec] = useState("Все");
  const known = new Set(doctors.map(d => d.spec));
  const specs = ["Все", ...SPEC_ORDER.filter(s => known.has(s)), ...[...known].filter(s => !SPEC_ORDER.includes(s)).sort()];
  const needle = q.trim().toLowerCase();
  const res = doctors.filter(d => (spec === "Все" || d.spec === spec) && (!needle
    || `${d.surname} ${d.given}`.toLowerCase().includes(needle) || d.spec.toLowerCase().includes(needle)
    || d.services.some(s => s.name.toLowerCase().includes(needle))));
  const open = (id: number) => router.push(`/vrach/${id}${reschedule ? `?perenos=${reschedule}` : ""}`);

  return (
    <section style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 8, maxWidth: 760 }}>
        <h1 style={{ margin: 0, fontSize: "var(--h1-size)", lineHeight: 1.02, letterSpacing: "-0.03em" }}>Запись к врачу</h1>
        <p style={{ margin: 0, fontSize: 16, color: "var(--color-neutral-800)", textWrap: "pretty" }}>Найдите врача по фамилии или специальности, выберите услугу и свободное время. Предоплата — 400 ₽, она засчитывается в стоимость приёма.</p>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 4, maxWidth: 760, borderRadius: 999, background: "var(--color-surface)", padding: "0 8px 0 20px" }}>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--color-neutral-600)" strokeWidth="2.4" strokeLinecap="round" style={{ flex: "none" }}><circle cx="11" cy="11" r="7" /><path d="M20 20l-3.5-3.5" /></svg>
        <input className="input" value={q} onChange={e => setQ(e.target.value)} placeholder="Фамилия врача, специальность или услуга" aria-label="Поиск врача"
          style={{ border: 0, boxShadow: "none", minHeight: 56, fontSize: 17, padding: "0 12px", background: "transparent", flex: 1, minWidth: 0 }} />
        {q && <button className="btn" onClick={() => { setQ(""); setSpec("Все"); }} style={{ padding: "8px 14px", fontSize: 14, background: "#fff" }}>Сбросить</button>}
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
        {specs.map(x => (
          <button key={x} onClick={() => setSpec(x)} style={{ font: "inherit", fontSize: 13, padding: "6px 12px", cursor: "pointer", border: "1px solid var(--color-divider)", background: spec === x ? tx : "transparent", color: spec === x ? bg : tx }}>{x}</button>
        ))}
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", borderBottom: "1px solid var(--color-divider)", paddingBottom: 8 }}>
        <span style={{ fontSize: 12, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--color-neutral-700)" }}>
          {reschedule ? "Перенос записи · " : ""}{res.length} {plural(res.length, "врач", "врача", "врачей")}
        </span>
        <span style={{ fontSize: 12, color: "var(--color-neutral-700)" }}>Время — по Челябинску</span>
      </div>
      {res.length === 0 && (
        <div style={{ padding: "24px 0", display: "flex", flexDirection: "column", gap: 6 }}>
          <span style={{ fontWeight: 800, fontSize: 20 }}>Никого не нашли</span>
          <span style={{ color: "var(--color-neutral-700)" }}>Проверьте написание фамилии или выберите специальность из списка выше.</span>
        </div>
      )}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(280px,1fr))", gap: 14, background: "transparent" }}>
        {res.map(d => (
          <div key={d.id} role="link" tabIndex={0} onClick={() => open(d.id)} onKeyDown={e => { if (e.key === "Enter") open(d.id); }} className="hov-neutral-100"
            style={{ background: "var(--color-bg)", padding: 18, display: "flex", flexDirection: "column", gap: 12, cursor: "pointer", border: "1px solid var(--color-divider)", borderRadius: 24 }}>
            <div style={{ display: "flex", gap: 14, alignItems: "flex-start" }}>
              <div style={{ width: 56, height: 68, flex: "none", background: "repeating-linear-gradient(135deg,var(--color-neutral-300) 0 2px,var(--color-neutral-200) 2px 7px)", display: "flex", alignItems: "flex-end", justifyContent: "center", font: "9px ui-monospace,monospace", color: "var(--color-neutral-700)", paddingBottom: 4, borderRadius: 18 }}>фото</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 3, minWidth: 0 }}>
                <span style={{ fontSize: 11, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--color-accent-700)" }}>{d.spec}</span>
                <span style={{ fontWeight: 800, fontSize: 18, lineHeight: 1.15 }}>{d.surname}</span>
                <span style={{ fontSize: 13, color: "var(--color-neutral-800)" }}>{d.given}</span>
              </div>
            </div>
            <div style={{ display: "flex", flexDirection: "column", borderTop: "1px solid var(--color-divider)" }}>
              {d.services.map(s => (
                <div key={s.name} style={{ display: "flex", justifyContent: "space-between", gap: 12, fontSize: 13, padding: "6px 0", borderBottom: "1px solid var(--color-neutral-300)" }}>
                  <span>{s.name}</span><span style={{ fontWeight: 600, whiteSpace: "nowrap" }}>{rub(s.priceKopecks)}</span>
                </div>
              ))}
            </div>
            {d.hasGroup && <span className="tag tag-outline" style={{ alignSelf: "flex-start" }}>Есть приём «при наборе группы»</span>}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "auto" }}>
              <span style={{ fontSize: 13 }}><span style={{ color: "var(--color-neutral-700)" }}>Ближайшее: </span><b>{d.nearest}</b></span>
              <span style={{ fontWeight: 800, fontSize: 14, color: "var(--color-accent)" }}>Выбрать →</span>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
