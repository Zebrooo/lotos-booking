"use client";
// Каркас CRM из прототипа: боковое меню, плашка паузы, шапка страницы с
// переключателем дня и кнопкой онлайн-записи, общий диалог.
import { useState, useTransition } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { logoutStaffAction, pauseAction, resumeAction } from "@/app/crm/actions";

const tx = "var(--color-text)", bgc = "var(--color-bg)", acc = "var(--color-accent)";
const kicker: React.CSSProperties = { fontSize: 11, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--color-neutral-700)" };
export type Role = "admin" | "senior" | "doctor";
const ROLE_LABEL: Record<Role, string> = { admin: "администратор", senior: "старший смены", doctor: "врач" };

export function Sidebar(props: { role: Role; name: string; reconBadge: number }) {
  const path = usePathname();
  const items: [string, string, number][] = props.role === "doctor"
    ? [["/crm/moy-priem", "Мой приём", 0]]
    : [["/crm/raspisanie", "Расписание", 0], ["/crm/zapisi", "Записи", 0], ["/crm/sverka", "Сверка оплат", props.reconBadge], ["/crm/pechat", "Печать на завтра", 0]];
  return (
    <aside className="no-print" style={{ borderRight: "1px solid var(--color-divider)", display: "flex", flexDirection: "column", position: "sticky", top: 0, height: "100vh" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: 16, borderBottom: "1px solid var(--color-divider)" }}>
        <div style={{ width: 18, height: 18, background: acc, borderRadius: "60% 0 60% 0", transform: "rotate(-45deg)" }} />
        <div style={{ display: "flex", flexDirection: "column", lineHeight: 1.05 }}><span style={{ fontWeight: 800, fontSize: 17 }}>ЛОТОС</span><span style={{ fontSize: 11, color: "var(--color-neutral-700)" }}>регистратура</span></div>
      </div>
      <nav style={{ display: "flex", flexDirection: "column", padding: "8px 0" }}>
        {items.map(([href, label, n]) => {
          const on = path === href || path.startsWith(href + "/");
          return (
            <Link key={href} href={href} className="plain-link" style={{ font: "inherit", fontSize: 14, letterSpacing: "normal", border: 0, textAlign: "left", padding: "10px 16px", cursor: "pointer", display: "flex", justifyContent: "space-between", alignItems: "center", background: on ? tx : "transparent", color: on ? bgc : tx, fontWeight: on ? 800 : 400, borderRadius: 999, textDecoration: "none" }}>
              <span>{label}</span>
              <span style={{ fontSize: 11, fontWeight: 800, padding: "1px 6px", background: acc, color: bgc, display: n ? "inline" : "none", borderRadius: 999 }}>{n}</span>
            </Link>
          );
        })}
      </nav>
      <div style={{ marginTop: "auto", padding: 16, borderTop: "1px solid var(--color-divider)", display: "flex", flexDirection: "column", gap: 8 }}>
        <span style={kicker}>Смена</span>
        <div style={{ display: "flex", flexDirection: "column", border: "1px solid var(--color-divider)", borderRadius: 16, overflow: "hidden" }}>
          <span style={{ fontSize: 13, padding: "7px 10px", borderBottom: "1px solid var(--color-divider)", background: tx, color: bgc }}>{props.name}</span>
          <form action={logoutStaffAction} style={{ display: "flex" }}>
            <button type="submit" style={{ borderRadius: 0, font: "inherit", fontSize: 13, border: 0, textAlign: "left", padding: "7px 10px", cursor: "pointer", background: "transparent", color: tx, flex: 1 }}>Выйти</button>
          </form>
        </div>
        <span style={{ fontSize: 12, color: "var(--color-neutral-700)" }}>{ROLE_LABEL[props.role]}</span>
      </div>
    </aside>
  );
}

export function PauseBanner(props: { paused: boolean; info: string; isSenior: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  if (!props.paused) return null;
  return (
    <div className="no-print" style={{ background: acc, color: bgc, padding: "10px 24px", display: "flex", gap: 16, alignItems: "center", flexWrap: "wrap", borderRadius: 14 }}>
      <span style={{ fontWeight: 800 }}>Онлайн-запись приостановлена</span>
      <span style={{ fontSize: 13 }}>{props.info}</span>
      {props.isSenior && <button className="btn" disabled={pending} onClick={() => start(async () => { await resumeAction(); router.refresh(); })} style={{ marginLeft: "auto", border: `1px solid ${bgc}`, color: bgc, padding: "6px 12px" }}>Возобновить</button>}
    </div>
  );
}

export type DlgSpec = { title: string; body: string; options?: string[]; textPh?: string; note?: string; noteFor?: (pick: string | null) => string; ok: string };

export function CrmDialog(props: { spec: DlgSpec; busy?: boolean; error?: string | null; onOk: (pick: string | null, text: string) => void; onClose: () => void }) {
  const [pick, setPick] = useState<string | null>(null);
  const [text, setText] = useState("");
  const s = props.spec;
  return (
    <div className="dialog-backdrop" style={{ zIndex: 30 }}>
      <div className="dialog" role="dialog" aria-modal="true" aria-label={s.title} style={{ width: "min(480px,100%)", background: bgc, gap: 14 }}>
        <span className="dialog-title">{s.title}</span>
        <span style={{ fontSize: 14, textWrap: "pretty" }}>{s.body}</span>
        {s.options && (
          <div style={{ display: "flex", flexDirection: "column", border: "1px solid var(--color-divider)", borderRadius: 16, overflow: "hidden" }}>
            {s.options.map(o => (
              <button key={o} onClick={() => setPick(o)} aria-pressed={pick === o} style={{ borderRadius: 0, font: "inherit", fontSize: 14, border: 0, borderBottom: "1px solid var(--color-divider)", textAlign: "left", padding: "10px 12px", cursor: "pointer", background: pick === o ? tx : "transparent", color: pick === o ? bgc : tx }}>{o}</button>
            ))}
          </div>
        )}
        {s.textPh && <textarea className="input" value={text} onChange={e => setText(e.target.value)} placeholder={s.textPh} style={{ minHeight: 70 }} />}
        {props.error ? <span role="alert" style={{ fontSize: 12, color: "var(--color-danger)" }}>{props.error}</span> : <span style={{ fontSize: 12, color: "var(--color-neutral-700)" }}>{s.noteFor ? s.noteFor(pick) : s.note ?? ""}</span>}
        <div className="dialog-actions" style={{ justifyContent: "flex-start" }}>
          <button className="btn btn-primary" disabled={props.busy || (!!s.options && !pick)} onClick={() => props.onOk(pick, text)} style={{ padding: "10px 16px" }}>{s.ok}</button>
          <button className="btn btn-secondary" onClick={props.onClose} style={{ padding: "10px 16px" }}>Отмена</button>
        </div>
      </div>
    </div>
  );
}

const PAUSE: DlgSpec = {
  title: "Приостановить онлайн-запись?", body: "Сайт перестанет принимать новые записи. Существующие записи и оплаты сохранятся.",
  options: ["Сбой расписания / 1С", "Врач заболел", "Нет связи с кассой"], textPh: "Комментарий для смены", ok: "Приостановить",
  note: "Сайт покажет: «Онлайн-запись временно недоступна, позвоните в регистратуру».",
};
const NEED_SENIOR: DlgSpec = { title: "Нужен старший смены", body: "Приостановить онлайн-запись может только старший администратор смены. Попросите его сделать это под своей учётной записью.", ok: "Понятно" };

export function CrmHeader(props: { title: string; role: Role; paused: boolean; days?: { href: string; label: string; on: boolean }[] }) {
  const router = useRouter();
  const [dlg, setDlg] = useState<DlgSpec | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const isDoc = props.role === "doctor", isSenior = props.role === "senior";
  const openPause = () => {
    if (isDoc) return;
    if (props.paused) { if (isSenior) start(async () => { await resumeAction(); router.refresh(); }); return; }
    setErr(null);
    setDlg(isSenior ? PAUSE : NEED_SENIOR);
  };
  return (
    <header className="no-print" style={{ display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap", padding: "14px 24px", borderBottom: "1px solid var(--color-divider)" }}>
      <h1 style={{ margin: 0, fontSize: 26, letterSpacing: "-0.02em", marginRight: "auto" }}>{props.title}</h1>
      {props.days && (
        <div style={{ display: "flex", gap: 3, padding: 3, borderRadius: 999, background: "var(--color-surface)" }}>
          {props.days.map(d => (
            <Link key={d.href} href={d.href} className="plain-link" style={{ font: "inherit", fontSize: 13, letterSpacing: "normal", border: 0, padding: "7px 12px", cursor: "pointer", background: d.on ? tx : "transparent", color: d.on ? bgc : tx, borderRadius: 999, textDecoration: "none" }}>{d.label}</Link>
          ))}
        </div>
      )}
      <button onClick={openPause} disabled={pending} style={{ font: "inherit", fontSize: 13, cursor: isDoc ? "default" : "pointer", display: "flex", alignItems: "center", gap: 8, padding: "7px 12px", border: "1px solid var(--color-divider)", background: "transparent", opacity: isDoc ? 0.5 : 1 }}>
        <span style={{ width: 8, height: 8, borderRadius: "50%", background: props.paused ? acc : "#2e7d32" }} />{props.paused ? "Онлайн-запись на паузе" : "Онлайн-запись принимается"}
      </button>
      {dlg && (
        <CrmDialog spec={dlg} busy={pending} error={err} onClose={() => setDlg(null)} onOk={(pick, text) => {
          if (dlg !== PAUSE) { setDlg(null); return; }
          start(async () => {
            const r = await pauseAction(pick ?? "", text);
            if (r.ok) { setDlg(null); router.refresh(); } else setErr(r.error);
          });
        }} />
      )}
    </header>
  );
}
