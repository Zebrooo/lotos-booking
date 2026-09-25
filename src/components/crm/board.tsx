"use client";
// Шторка записи и её действия — как в прототипе CRM: факты, журнал операций,
// кнопки по статусу; перенос и отмена — через общий диалог.
import { useCallback, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { BookingVM, ActionKey } from "@/lib/crm/view";
import { bookingAction, cancelAction, moveAction, moveOptionsAction } from "@/app/crm/actions";
import { CrmDialog, type DlgSpec } from "./shell";
import { Toast } from "@/components/common/toast";

const kicker: React.CSSProperties = { fontSize: 11, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--color-neutral-700)" };
type Pending = { kind: "move"; id: number; spec: DlgSpec; iso: Map<string, string> } | { kind: "cancel"; id: number; spec: DlgSpec };

/** Выбранная запись, шторка и диалоги. Родитель рисует список или сетку и зовёт open(id). */
export function useBoard(items: BookingVM[]) {
  const router = useRouter();
  const [sel, setSel] = useState<number | null>(null);
  const [dlg, setDlg] = useState<Pending | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const clearToast = useCallback(() => setToast(null), []);
  const cur = items.find(b => b.id === sel) ?? null;

  const run = (key: ActionKey, b: BookingVM) => {
    if (key === "recon") { router.push(`/crm/sverka?zapis=${b.id}`); return; }
    if (key === "move") {
      start(async () => {
        const opts = await moveOptionsAction(b.id);
        if (!opts.length) { setToast("Свободного времени у врача не нашлось"); return; }
        setErr(null);
        setDlg({ kind: "move", id: b.id, iso: new Map(opts.map(o => [o.label, o.iso])), spec: {
          title: "Перенести запись", body: `${b.patient} · ${b.svc}. ${b.paid ? "Предоплата переедет на новую запись без возврата и повторной оплаты." : "Срок оплаты пересчитается от нового времени."}`,
          options: opts.map(o => o.label), ok: "Перенести", note: "Старая запись закроется, новая создастся; в журнале останутся обе." } });
      });
      return;
    }
    if (key === "cancel") {
      setErr(null);
      setDlg({ kind: "cancel", id: b.id, spec: {
        title: "Отменить запись", body: `До приёма ${b.hoursBefore} ч. ${b.paid ? `Предоплата ${b.money} будет возвращена — отмена возможна в любой момент.` : "Предоплата не вносилась."}`,
        options: ["По просьбе пациента", "По инициативе клиники"], ok: "Отменить", note: "Инициатор, время и срок до приёма сохранятся в записи." } });
      return;
    }
    start(async () => {
      const r = await bookingAction(key, b.id);
      if (!r.ok) setToast(r.error);
      router.refresh();
    });
  };

  const ui = (
    <>
      {cur && <Drawer b={cur} busy={pending} onClose={() => setSel(null)} onAction={k => run(k, cur)} />}
      {dlg && (
        <CrmDialog spec={dlg.spec} busy={pending} error={err} onClose={() => setDlg(null)} onOk={pick => start(async () => {
          const r = dlg.kind === "move" ? await moveAction(dlg.id, dlg.iso.get(pick ?? "") ?? "")
            : await cancelAction(dlg.id, pick === "По инициативе клиники" ? "clinic" : "patient");
          if (!r.ok) { setErr(r.error); return; }
          setDlg(null);
          setToast(dlg.kind === "move" ? "Запись перенесена, пациенту уйдёт СМС" : "Запись отменена");
          router.refresh();
        })} />
      )}
      <Toast message={toast} onDone={clearToast} />
    </>
  );
  return { sel, open: setSel, ui };
}

function Drawer({ b, busy, onClose, onAction }: { b: BookingVM; busy: boolean; onClose: () => void; onAction: (k: ActionKey) => void }) {
  const d = b.drawer;
  return (
    <>
      <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "color-mix(in srgb,var(--color-neutral-900) 30%,transparent)", zIndex: 20 }} />
      <div role="dialog" aria-modal="true" aria-label={`Запись № ${b.id}`} style={{ position: "fixed", top: 0, right: 0, bottom: 0, width: "min(460px,100%)", background: "var(--color-bg)", boxShadow: "var(--shadow-lg)", zIndex: 21, display: "flex", flexDirection: "column", overflowY: "auto" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", padding: "16px 20px", borderBottom: "1px solid var(--color-divider)" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
            <span style={{ fontSize: 12, color: "var(--color-neutral-700)" }}>Запись № {b.id} · {d.src}</span>
            <span style={{ fontWeight: 800, fontSize: 22, lineHeight: 1.1 }}>{b.patient}</span>
            <span style={{ fontSize: 13 }}>{b.dob} · {b.phone}</span>
          </div>
          <button className="btn btn-icon" onClick={onClose} aria-label="Закрыть" style={{ fontSize: 20 }}>×</button>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", borderBottom: "1px solid var(--color-divider)" }}>
          <div style={{ padding: "12px 20px", borderRight: "1px solid var(--color-divider)", display: "flex", flexDirection: "column", gap: 4 }}>
            <span style={kicker}>Запись</span><span style={{ fontWeight: 800, color: d.stColor }}>{d.state}</span><span style={{ fontSize: 12, color: "var(--color-neutral-700)" }}>{d.stateSub}</span>
          </div>
          <div style={{ padding: "12px 20px", display: "flex", flexDirection: "column", gap: 4 }}>
            <span style={kicker}>Деньги</span><span style={{ fontWeight: 800 }}>{d.money}</span><span style={{ fontSize: 12, color: "var(--color-neutral-700)" }}>{d.moneySub}</span>
          </div>
        </div>
        <div style={{ padding: "8px 20px", display: "flex", flexDirection: "column" }}>
          {d.facts.map(x => (
            <div key={x.k} style={{ display: "grid", gridTemplateColumns: "120px minmax(0,1fr)", gap: 8, padding: "7px 0", borderBottom: "1px solid var(--color-neutral-300)", fontSize: 13 }}><span style={{ color: "var(--color-neutral-700)" }}>{x.k}</span><span style={{ fontWeight: 600 }}>{x.v}</span></div>
          ))}
        </div>
        <div style={{ padding: "12px 20px", display: "flex", flexDirection: "column", gap: 8 }}>
          <span style={kicker}>Журнал операций</span>
          {d.ops.map((o, i) => (
            <div key={i} style={{ display: "grid", gridTemplateColumns: "86px minmax(0,1fr) auto", gap: 8, fontSize: 12, padding: "6px 0", borderBottom: "1px solid var(--color-neutral-300)" }}>
              <span style={{ color: "var(--color-neutral-700)" }}>{o.t}</span>
              <span style={{ display: "flex", flexDirection: "column" }}><b>{o.op}</b><span style={{ color: "var(--color-neutral-700)" }}>{o.detail}</span></span>
              <span style={{ fontWeight: 800, whiteSpace: "nowrap" }}>{o.amount}</span>
            </div>
          ))}
          {d.ops.length === 0 && <span style={{ fontSize: 12, color: "var(--color-neutral-700)" }}>Операций нет.</span>}
        </div>
        {d.actions.length > 0 && (
          <div style={{ marginTop: "auto", padding: "16px 20px", borderTop: "1px solid var(--color-divider)", display: "flex", flexDirection: "column", gap: 6 }}>
            {d.actions.map(a => (
              <button key={a.key} className={`btn ${a.primary ? "btn-primary" : "btn-secondary"}`} disabled={busy} onClick={() => onAction(a.key)} style={{ padding: "11px 14px", justifyContent: "space-between" }}>{a.label}<span>→</span></button>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
