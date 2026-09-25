"use client";
// Экраны CRM «Записи», «Сверка оплат», «Мой приём» и кнопка печати — по прототипу.
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { BookingVM } from "@/lib/crm/view";
import { reconcileAction, requestDayOffAction } from "@/app/crm/actions";
import { useBoard } from "./board";
import { CrmDialog } from "./shell";

const tx = "var(--color-text)", bgc = "var(--color-bg)";
const kicker: React.CSSProperties = { fontSize: 11, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--color-neutral-700)" };

const FILTERS: [string, string, (b: BookingVM) => boolean][] = [
  ["all", "Все", () => true],
  ["pending", "Ждут оплаты", b => b.stKey === "pending"],
  ["claimed", "Не сверены", b => b.stKey === "claimed"],
  ["confirmed", "Подтверждены", b => b.stKey === "confirmed"],
  ["closed", "Завершены", b => ["done", "noshow", "arrived"].includes(b.stKey)],
  ["cancelled", "Отменены", b => ["cancelled", "moved"].includes(b.stKey)],
];

export function ListView(props: { items: BookingVM[]; doctors: { id: number; short: string }[] }) {
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState("all");
  const [doc, setDoc] = useState("");
  const board = useBoard(props.items);
  const qq = q.trim().toLowerCase(), qd = qq.replace(/\D/g, "");
  const base = props.items.filter(b => (!doc || String(b.doctorId) === doc)
    && (!qq || b.patient.toLowerCase().includes(qq) || (qd.length > 0 && b.phone.replace(/\D/g, "").includes(qd)) || String(b.id).includes(qq)));
  const f = FILTERS.find(x => x[0] === filter)![2];
  const rows = base.filter(f);
  return (
    <>
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
        <input className="input" value={q} onChange={e => setQ(e.target.value)} placeholder="Пациент, телефон или № записи" aria-label="Поиск записи" style={{ maxWidth: 300 }} />
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {FILTERS.map(([k, l, fn]) => (
            <button key={k} onClick={() => setFilter(k)} aria-pressed={filter === k} style={{ font: "inherit", fontSize: 13, border: 0, padding: "8px 14px", cursor: "pointer", display: "flex", gap: 6, alignItems: "center", background: filter === k ? tx : "transparent", color: filter === k ? bgc : tx }}>{l}<b>{base.filter(fn).length}</b></button>
          ))}
        </div>
        <select className="input" value={doc} onChange={e => setDoc(e.target.value)} aria-label="Врач" style={{ maxWidth: 220 }}>
          <option value="">Все врачи</option>
          {props.doctors.map(d => <option key={d.id} value={String(d.id)}>{d.short}</option>)}
        </select>
      </div>
      <div style={{ overflowX: "auto" }}>
        <table className="table" style={{ minWidth: 900 }}>
          <thead><tr><th>№</th><th>Когда</th><th>Пациент</th><th>Врач · услуга</th><th>Запись</th><th>Деньги</th><th>Канал</th></tr></thead>
          <tbody>
            {rows.map(r => (
              <tr key={r.id} onClick={() => board.open(r.id)} style={{ cursor: "pointer" }}>
                <td style={{ fontSize: 12, color: "var(--color-neutral-700)" }}>{r.id}</td>
                <td style={{ whiteSpace: "nowrap" }}><b>{r.time}</b> <span style={{ color: "var(--color-neutral-700)" }}>{r.dayRel}</span></td>
                <td><div style={{ display: "flex", flexDirection: "column" }}><span style={{ fontWeight: 600 }}>{r.patient}</span><span style={{ fontSize: 12, color: "var(--color-neutral-700)" }}>{r.phone}</span></div></td>
                <td><div style={{ display: "flex", flexDirection: "column" }}><span>{r.doc}</span><span style={{ fontSize: 12, color: "var(--color-neutral-700)" }}>{r.svc}</span></div></td>
                <td><span style={{ fontSize: 11, padding: "3px 8px", whiteSpace: "nowrap", background: r.stBg, color: r.stFg, border: r.stBd, borderRadius: 999 }}>{r.state}</span></td>
                <td style={{ whiteSpace: "nowrap" }}>{r.money}</td>
                <td style={{ fontSize: 12 }}>{r.src}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length === 0 && <div style={{ padding: "24px 8px", color: "var(--color-neutral-700)" }}>Записей по этим условиям нет.</div>}
      </div>
      {board.ui}
    </>
  );
}

export type IncomingVM = { id: number; amount: string; time: string; text: string };

export function ReconView(props: { incoming: IncomingVM[]; waiting: BookingVM[]; preselect: number | null; note: string }) {
  const router = useRouter();
  const [pay, setPay] = useState<number | null>(null);
  const [wait, setWait] = useState<number | null>(props.preselect);
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const can = pay != null && wait != null;
  return (
    <>
      <div style={{ background: "var(--color-surface)", padding: "14px 16px", fontSize: 13, textWrap: "pretty", maxWidth: 900, borderRadius: 24 }}>{props.note}</div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(340px,1fr))", gap: 24, alignItems: "start" }}>
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ display: "flex", justifyContent: "space-between", paddingBottom: 8, borderBottom: "1px solid var(--color-divider)" }}><span style={kicker}>Поступления из банка</span><span style={{ fontSize: 12 }}>{props.incoming.length} не сопоставлено</span></div>
          {props.incoming.map(p => (
            <div key={p.id} role="button" tabIndex={0} aria-pressed={pay === p.id} onClick={() => { setPay(p.id); setErr(null); }} onKeyDown={e => { if (e.key === "Enter") setPay(p.id); }}
              style={{ padding: 12, borderBottom: "1px solid var(--color-divider)", cursor: "pointer", display: "grid", gridTemplateColumns: "minmax(0,1fr) auto", gap: "4px 12px", background: pay === p.id ? tx : "transparent", color: pay === p.id ? bgc : tx }}>
              <span style={{ fontWeight: 800 }}>{p.amount}</span><span style={{ fontSize: 12 }}>{p.time}</span>
              <span style={{ fontSize: 12, gridColumn: "1/-1", fontFamily: "ui-monospace,Menlo,monospace" }}>{p.text}</span>
            </div>
          ))}
          {props.incoming.length === 0 && <span style={{ padding: "16px 0", color: "var(--color-neutral-700)" }}>Несопоставленных поступлений нет.</span>}
        </div>
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ display: "flex", justifyContent: "space-between", paddingBottom: 8, borderBottom: "1px solid var(--color-divider)" }}><span style={kicker}>Записи, ждущие оплаты</span><span style={{ fontSize: 12 }}>{props.waiting.length} записей</span></div>
          {props.waiting.map(w => (
            <div key={w.id} role="button" tabIndex={0} aria-pressed={wait === w.id} onClick={() => { setWait(w.id); setErr(null); }} onKeyDown={e => { if (e.key === "Enter") setWait(w.id); }}
              style={{ padding: 12, borderBottom: "1px solid var(--color-divider)", cursor: "pointer", display: "grid", gridTemplateColumns: "minmax(0,1fr) auto", gap: "4px 12px", background: wait === w.id ? tx : "transparent", color: wait === w.id ? bgc : tx }}>
              <span style={{ fontWeight: 800 }}>{w.patient}</span><span style={{ fontSize: 12 }}>{w.state}</span>
              <span style={{ fontSize: 12 }}>{w.recon.line}</span><span style={{ fontSize: 12, fontWeight: 600 }}>{w.recon.deadline}</span>
            </div>
          ))}
        </div>
      </div>
      <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap", borderTop: "1px solid var(--color-divider)", paddingTop: 16 }}>
        <button className="btn btn-primary" disabled={!can || pending} onClick={() => start(async () => {
          const r = await reconcileAction(pay!, wait!);
          if (!r.ok) { setErr(r.error); return; }
          setPay(null); setWait(null); router.refresh();
        })} style={{ padding: "12px 16px", minWidth: 260, justifyContent: "space-between" }}>Сопоставить и подтвердить<span>→</span></button>
        <span role={err ? "alert" : undefined} style={{ fontSize: 13, color: err ? "var(--color-danger)" : "var(--color-neutral-700)" }}>{err ?? (can ? "Будет пробит чек аванса и запись подтвердится." : "Выберите поступление слева и запись справа.")}</span>
      </div>
    </>
  );
}

export function PrintButton() {
  return <button className="btn btn-primary" onClick={() => window.print()} style={{ padding: "10px 16px" }}>Распечатать</button>;
}

export type DoctorDayVM = { title: string; stat: string; off: boolean; rows: BookingVM[] };

export function DoctorView(props: { days: DoctorDayVM[]; options: { label: string; day: string; paid: number; dayText: string }[]; sent: string | null }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <div style={{ display: "flex", gap: 24, flexWrap: "wrap", alignItems: "flex-start" }}>
      <div style={{ flex: "1 1 520px", minWidth: 0, display: "flex", flexDirection: "column", gap: 20 }}>
        {props.days.map(md => (
          <div key={md.title} style={{ display: "flex", flexDirection: "column" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", borderBottom: "1px solid var(--color-divider)", paddingBottom: 6 }}><span style={{ fontWeight: 800, fontSize: 18 }}>{md.title}</span><span style={{ fontSize: 12, color: "var(--color-neutral-700)" }}>{md.stat}</span></div>
            {md.off && <span style={{ padding: "12px 0", fontWeight: 600, color: "var(--color-accent-700)" }}>Приём снят</span>}
            {md.rows.map(r => (
              <div key={r.id} style={{ display: "grid", gridTemplateColumns: "64px minmax(0,1fr) auto", gap: 12, padding: "10px 0", borderBottom: "1px solid var(--color-divider)", alignItems: "center" }}>
                <span style={{ fontWeight: 800, fontSize: 16 }}>{r.time}</span>
                <div style={{ display: "flex", flexDirection: "column" }}><span style={{ fontWeight: 600 }}>{r.patient}</span><span style={{ fontSize: 12, color: "var(--color-neutral-700)" }}>{r.svc} · {r.dob}</span></div>
                <span style={{ fontSize: 11, padding: "3px 8px", background: r.stBg, color: r.stFg, border: r.stBd, borderRadius: 999 }}>{r.state}</span>
              </div>
            ))}
          </div>
        ))}
      </div>
      <div style={{ flex: "1 1 280px", maxWidth: 360, background: "var(--color-surface)", padding: 18, display: "flex", flexDirection: "column", gap: 10, borderRadius: 24 }}>
        <span style={{ fontWeight: 800, fontSize: 16 }}>Не можете провести приём?</span>
        <span style={{ fontSize: 13, textWrap: "pretty" }}>Приём с оплаченными записями снимает администратор: он свяжется с каждым пациентом и вернёт деньги или перенесёт запись.</span>
        {props.sent && <span style={{ fontSize: 13, fontWeight: 600 }}>Запрос отправлен: {props.sent}</span>}
        <button className="btn btn-primary" onClick={() => { setErr(null); setOpen(true); }} disabled={!!props.sent} style={{ padding: "12px 14px", justifyContent: "space-between" }}>Запросить снятие приёма<span>→</span></button>
      </div>
      {open && (
        <CrmDialog busy={pending} error={err} onClose={() => setOpen(false)}
          spec={{ title: "Запросить снятие приёма", body: "Выберите день и причину. Администратор разберёт записи пациентов.", options: props.options.map(o => o.label), textPh: "Причина: болезнь, не набрали пациентов…", ok: "Отправить запрос",
            noteFor: pick => {
              const o = props.options.find(x => x.label === pick) ?? props.options.find(x => x.paid > 0);
              if (!o || !o.paid) return pick ? `${o?.dayText ?? "На этот день"} оплаченных записей нет.` : "Выберите день.";
              return `${o.dayText} у вас ${o.paid} ${o.paid % 10 === 1 && o.paid % 100 !== 11 ? "оплаченная запись" : [2, 3, 4].includes(o.paid % 10) && ![12, 13, 14].includes(o.paid % 100) ? "оплаченные записи" : "оплаченных записей"} — пациентам придётся вернуть деньги или перенести приём.`;
            } }}
          onOk={(pick, text) => start(async () => {
            const o = props.options.find(x => x.label === pick);
            const r = await requestDayOffAction(o?.day ?? "", text);
            if (!r.ok) { setErr(r.error); return; }
            setOpen(false); router.refresh();
          })} />
      )}
    </div>
  );
}
