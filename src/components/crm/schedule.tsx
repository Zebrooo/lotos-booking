"use client";
// Расписание дня — сетка из прототипа CRM: колонки врачей, часы 8–18,
// блоки записей по состояниям, свободная квота сайта, снятый приём.
import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { BookingVM } from "@/lib/crm/view";
import { LEGEND } from "@/lib/crm/view";
import { closeDayAction, dayOffDataAction, type DayOffRow } from "@/app/crm/actions";
import { useBoard } from "./board";

export const PX = 2.4, START = 8 * 60, END = 18 * 60;
const tx = "var(--color-text)", bgc = "var(--color-bg)", acc = "var(--color-accent)";
const fmt = (t: number) => `${String(Math.floor(t / 60)).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}`;

export type ColumnVM = {
  id: number; short: string; spec: string; room: string | null; stat: string; off: string | null; group: string | null;
  quota: { fromMin: number; toMin: number }[]; items: BookingVM[];
};

export function ScheduleView(props: { day: string; dayTitle: string; cols: ColumnVM[]; canCancel: boolean; openDayOff?: { doctorId: number; reason: string } | null }) {
  const all = props.cols.flatMap(c => c.items);
  const board = useBoard(all);
  const [dc, setDc] = useState<{ doctorId: number; reason: string | null } | null>(props.openDayOff ?? null);
  const hours: number[] = [];
  for (let t = START; t <= END; t += 60) hours.push(t);
  const gridH = `${(END - START) * PX}px`;
  return (
    <>
      <div style={{ display: "flex", gap: 16, flexWrap: "wrap", fontSize: 12, color: "var(--color-neutral-800)" }}>
        {LEGEND.map(l => (
          <span key={l.label} style={{ display: "flex", alignItems: "center", gap: 6 }}><span style={{ width: 14, height: 14, background: l.bg, border: l.bd, borderRadius: 5 }} />{l.label}</span>
        ))}
      </div>
      <div style={{ overflowX: "auto", overflowY: "hidden", border: "1px solid var(--color-divider)", borderRadius: 22 }}>
        <div style={{ display: "grid", gridTemplateColumns: `48px repeat(${props.cols.length},minmax(120px,1fr))` }}>
          <div style={{ borderBottom: "1px solid var(--color-divider)", borderRight: "1px solid var(--color-divider)" }} />
          {props.cols.map(c => (
            <div key={c.id} style={{ borderBottom: "1px solid var(--color-divider)", borderRight: "1px solid var(--color-divider)", padding: "8px 10px", display: "flex", flexDirection: "column", gap: 4, minHeight: 74, minWidth: 0, background: c.off ? "var(--color-neutral-200)" : "transparent" }}>
              <span style={{ fontWeight: 800, fontSize: 14, lineHeight: 1.2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{c.short}</span>
              <span style={{ fontSize: 12, lineHeight: 1.3, color: "var(--color-neutral-700)" }}>{c.spec}{c.room ? ` · каб. ${c.room}` : ""}</span>
              <div style={{ display: "flex", gap: "2px 6px", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap" }}>
                <span style={{ fontSize: 11, color: "var(--color-neutral-800)" }}>{c.stat}</span>
                {props.canCancel && !c.off && <button onClick={() => setDc({ doctorId: c.id, reason: null })} style={{ font: "inherit", fontSize: 11, border: 0, background: "transparent", color: "var(--color-accent-700)", cursor: "pointer", padding: 0 }}>Снять приём</button>}
              </div>
              {c.group && <span className="tag tag-outline" style={{ alignSelf: "flex-start", fontSize: 10, padding: "1px 6px" }}>{c.group}</span>}
            </div>
          ))}
          <div style={{ position: "relative", height: gridH, borderRight: "1px solid var(--color-divider)" }}>
            {hours.map(t => <span key={t} style={{ position: "absolute", left: 8, top: `${(t - START) * PX}px`, fontSize: 11, color: "var(--color-neutral-700)", transform: "translateY(3px)" }}>{fmt(t)}</span>)}
          </div>
          {props.cols.map(c => (
            <div key={c.id} style={{ position: "relative", height: gridH, borderRight: "1px solid var(--color-divider)", background: `repeating-linear-gradient(180deg,transparent 0 ${60 * PX - 1}px,var(--color-neutral-300) ${60 * PX - 1}px ${60 * PX}px)` }}>
              {c.off && (
                <div style={{ position: "absolute", inset: 0, background: "repeating-linear-gradient(135deg,var(--color-neutral-200) 0 6px,transparent 6px 12px)", display: "flex", alignItems: "flex-start", padding: 12 }}>
                  <span style={{ background: bgc, padding: "4px 8px", fontWeight: 800, fontSize: 12, borderRadius: 999 }}>Приём снят · {c.off}</span>
                </div>
              )}
              {c.quota.map(q => (
                <div key={q.fromMin} style={{ position: "absolute", left: 3, right: 3, top: `${(q.fromMin - START) * PX + 1}px`, height: `${(q.toMin - q.fromMin) * PX - 2}px`, border: "1px dashed var(--color-neutral-500)", background: "repeating-linear-gradient(135deg,transparent 0 5px,var(--color-neutral-200) 5px 7px)", fontSize: 10, lineHeight: 1.3, color: "var(--color-neutral-700)", padding: "3px 6px", borderRadius: 10, overflow: "hidden", whiteSpace: "nowrap", textOverflow: "ellipsis" }}>{fmt(q.fromMin)} квота сайта</div>
              ))}
              {c.items.map(b => (
                <div key={b.id} role="button" tabIndex={0} onClick={() => board.open(b.id)} onKeyDown={e => { if (e.key === "Enter") board.open(b.id); }} title={b.block.title} className="hov-bright"
                  style={{ position: "absolute", left: 3, right: 3, top: `${(b.startMin - START) * PX + 1}px`, height: `${b.durMin * PX - 2}px`, padding: "4px 7px", overflow: "hidden", cursor: "pointer", display: "flex", flexDirection: "column", justifyContent: "center", gap: 1, lineHeight: 1.25, background: b.stBg, color: b.stFg, border: b.stBd, outline: board.sel === b.id ? `2px solid ${acc}` : "0", outlineOffset: 1, borderRadius: 10 }}>
                  <span style={{ fontSize: 12, display: "flex", gap: 5, minWidth: 0, whiteSpace: "nowrap" }}><b style={{ flex: "none" }}>{b.time}</b><span style={{ fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis" }}>{b.short}</span></span>
                  <span style={{ fontSize: 11, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", opacity: 0.85 }}>{b.block.sub}</span>
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
      {board.ui}
      {dc && (() => {
        const col = props.cols.find(c => c.id === dc.doctorId);
        return col ? <DayOffModal doctorId={col.id} day={props.day} title={`${col.short} · ${props.dayTitle}`} presetReason={dc.reason} onClose={() => setDc(null)} /> : null;
      })()}
    </>
  );
}

const REASONS = ["Болезнь", "Не набрали пациентов", "Другое"];
type Choice = { kind?: "refund" | "move"; iso?: string; called?: boolean };

export function DayOffModal(props: { doctorId: number; day: string; title: string; presetReason: string | null; onClose: () => void }) {
  const router = useRouter();
  const [rows, setRows] = useState<DayOffRow[] | null>(null);
  const [reason, setReason] = useState<string | null>(props.presetReason);
  const [choices, setChoices] = useState<Record<number, Choice>>({});
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();
  useEffect(() => {
    let alive = true;
    void dayOffDataAction(props.doctorId, props.day).then(r => { if (alive) setRows(r); });
    return () => { alive = false; };
  }, [props.doctorId, props.day]);
  const list = rows ?? [];
  const ready = (c: Choice | undefined) => !!c?.kind && (c.kind !== "move" || !!c.iso) && !!c.called;
  const done = list.filter(r => ready(choices[r.id])).length;
  const set = (id: number, p: Choice) => setChoices(s => ({ ...s, [id]: { ...s[id], ...p } }));
  const apply = () => start(async () => {
    const r = await closeDayAction(props.doctorId, props.day, reason ?? "", list.map(x => ({ bookingId: x.id, kind: choices[x.id]!.kind!, iso: choices[x.id]!.iso, called: !!choices[x.id]!.called })));
    if (!r.ok) { setErr(r.error); return; }
    props.onClose();
    router.replace(`/crm/raspisanie?den=${props.day}`);
    router.refresh();
  });
  return (
    <div className="dialog-backdrop" style={{ zIndex: 30, alignItems: "start", overflowY: "auto" }}>
      <div role="dialog" aria-modal="true" aria-label="Снятие приёма" style={{ width: "min(980px,100%)", background: bgc, boxShadow: "var(--shadow-lg)", display: "flex", flexDirection: "column", margin: "24px 0" }}>
        <div style={{ padding: "18px 24px", borderBottom: "1px solid var(--color-divider)", display: "flex", flexDirection: "column", gap: 6 }}>
          <span style={{ fontSize: 12, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--color-accent-700)" }}>Снятие приёма</span>
          <span style={{ fontWeight: 800, fontSize: 26, lineHeight: 1.1 }}>{props.title}</span>
          <span style={{ fontSize: 14, textWrap: "pretty" }}>По каждому пациенту выберите: вернуть деньги или перенести. Позвоните каждому — СМС отправится после звонка. Окно не закроется, пока решение не принято по всем.</span>
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginTop: 4 }}>
            <span style={{ fontSize: 13, color: "var(--color-neutral-700)" }}>Причина:</span>
            {REASONS.map(r => (
              <button key={r} onClick={() => setReason(r)} aria-pressed={reason === r} style={{ font: "inherit", fontSize: 13, padding: "5px 10px", cursor: "pointer", border: "1px solid var(--color-divider)", background: reason === r ? tx : "transparent", color: reason === r ? bgc : tx }}>{r}</button>
            ))}
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "column" }}>
          {rows == null && <div style={{ padding: "20px 24px", color: "var(--color-neutral-700)" }}>Загружаем записи…</div>}
          {list.map(r => {
            const c = choices[r.id] ?? {};
            const ok = ready(c);
            return (
              <div key={r.id} style={{ display: "grid", gridTemplateColumns: "minmax(180px,1.1fr) minmax(220px,1.4fr) minmax(160px,1fr)", gap: 16, padding: "14px 24px", borderBottom: "1px solid var(--color-divider)", alignItems: "start", background: ok ? "var(--color-neutral-100)" : "transparent" }}>
                <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                  <span style={{ fontWeight: 800, fontSize: 15 }}>{r.time} · {r.patient}</span>
                  <span style={{ fontSize: 12, color: "var(--color-neutral-700)" }}>{r.phone} · {r.svc}</span>
                  <span style={{ fontSize: 12, fontWeight: 600 }}>{r.paid ? `Оплачено ${r.prepay} · ${r.src}` : `Не оплачено · ${r.src}`}</span>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", border: "1px solid var(--color-divider)" }}>
                    <button onClick={() => set(r.id, { kind: "refund" })} style={{ font: "inherit", fontSize: 13, border: 0, borderRight: "1px solid var(--color-divider)", padding: "8px 10px", textAlign: "left", cursor: "pointer", background: c.kind === "refund" ? tx : "transparent", color: c.kind === "refund" ? bgc : tx }}>{r.paid ? `Вернуть ${r.prepay}` : "Отменить"}</button>
                    <button onClick={() => set(r.id, { kind: "move" })} style={{ font: "inherit", fontSize: 13, border: 0, padding: "8px 10px", textAlign: "left", cursor: "pointer", background: c.kind === "move" ? tx : "transparent", color: c.kind === "move" ? bgc : tx }}>Перенести</button>
                  </div>
                  {c.kind === "move" && (
                    <select className="input" value={c.iso ?? ""} onChange={e => set(r.id, { iso: e.target.value })} style={{ borderColor: c.iso ? "var(--color-divider)" : acc }}>
                      <option value="">Выберите новое время…</option>
                      {r.options.map(o => <option key={o.iso} value={o.iso}>{o.label}</option>)}
                    </select>
                  )}
                </div>
                <label onClick={e => { e.preventDefault(); set(r.id, { called: !c.called }); }} style={{ display: "flex", gap: 8, alignItems: "center", cursor: "pointer", fontSize: 13 }}>
                  <span style={{ width: 18, height: 18, flex: "none", border: `1.5px solid ${c.called ? acc : "var(--color-divider)"}`, background: c.called ? acc : "transparent", color: bgc, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 800 }}>{c.called ? "✓" : ""}</span>
                  Позвонил, пациент в курсе
                </label>
              </div>
            );
          })}
          {rows != null && list.length === 0 && <div style={{ padding: "20px 24px", color: "var(--color-neutral-700)" }}>Записей на этот день нет — приём можно снять сразу.</div>}
        </div>
        <div style={{ padding: "16px 24px", display: "flex", gap: 16, alignItems: "center", flexWrap: "wrap", borderTop: "1px solid var(--color-divider)" }}>
          <span style={{ fontWeight: 800, fontSize: 18, marginRight: "auto" }}>Решено {done} из {list.length}</span>
          {err && <span role="alert" style={{ fontSize: 13, color: "var(--color-danger)" }}>{err}</span>}
          <button className="btn btn-secondary" onClick={props.onClose} style={{ padding: "12px 16px" }}>Отложить</button>
          <button className="btn btn-primary" onClick={apply} disabled={pending || rows == null || done < list.length || !reason} style={{ padding: "12px 16px", minWidth: 220, justifyContent: "space-between" }}>Снять приём<span>→</span></button>
        </div>
      </div>
    </div>
  );
}
