"use client";
// Личный кабинет — вкладки «Обзор / Записи / Документы / Платежи / Профиль и семья»
// из прототипа. Все подписи приходят готовыми с сервера (cabinetViewModel);
// здесь только выбор человека, вкладки, диалоги и вызовы действий.
import { useCallback, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { CabinetVM, VisitVM, DocVM } from "@/lib/cabinet/view-model";
import { Toast } from "@/components/common/toast";
import { rub } from "@/lib/format";
import {
  payVisitAction, cancelVisitAction, markReadAction, updateAccountAction, cabinetRequestAction, bookForAction, logoutAction,
} from "@/app/(site)/kabinet/actions";

type Tab = "overview" | "visits" | "docs" | "pays" | "profile";
type Dlg = { kind: "visit" | "doc"; id: number } | null;

const acc = "var(--color-accent)", tx = "var(--color-text)", sf = "var(--color-surface)";
const kicker: React.CSSProperties = { fontSize: 12, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--color-neutral-700)" };
const pillBtn: React.CSSProperties = { font: "inherit", fontSize: 14, fontWeight: 600, border: 0, padding: "8px 16px", cursor: "pointer", display: "flex", gap: 6, alignItems: "center" };
const pill = (sel: boolean) => ({ background: sel ? tx : sf, color: sel ? "#fff" : tx });
const closeBtn: React.CSSProperties = { width: 36, height: 36, border: 0, background: sf, cursor: "pointer", fontSize: 18, lineHeight: 1, color: tx };
const clickable = (run: () => void) => ({ role: "button", tabIndex: 0, onClick: run, onKeyDown: (e: React.KeyboardEvent) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); run(); } } });

export function Cabinet({ vm, ownerId }: { vm: CabinetVM; ownerId: number }) {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("overview");
  const [who, setWho] = useState<string>("all");
  const [rec, setRec] = useState<"up" | "past" | "cancelled">("up");
  const [docType, setDocType] = useState<"all" | DocVM["kind"]>("all");
  const [dlg, setDlg] = useState<Dlg>(null);
  const [confirm, setConfirm] = useState(false);
  const [read, setRead] = useState<number[]>([]);
  const [toast, setToast] = useState<string | null>(null);
  const [email, setEmail] = useState(vm.email);
  const [savedEmail, setSavedEmail] = useState(vm.email);
  const [notif, setNotif] = useState(() => Object.fromEntries(vm.notifs.map(n => [n.key, n.on])) as Record<CabinetVM["notifs"][number]["key"], boolean>);
  const [pending, start] = useTransition();
  const clearToast = useCallback(() => setToast(null), []);

  const inWho = (x: { who: number }) => who === "all" || String(x.who) === who;
  const visits = vm.visits.filter(inWho);
  const up = visits.filter(v => v.kind === "up");
  const past = visits.filter(v => v.kind === "done").reverse();
  const canc = visits.filter(v => v.kind === "cancelled").reverse();
  const docs = vm.docs.filter(inWho).map(d => ({ ...d, isNew: d.isNew && !read.includes(d.id) }));
  const newN = docs.filter(d => d.isNew).length;
  const pays = vm.payments.filter(inWho);
  const total = pays.reduce((a, p) => a + p.kopecks, 0);
  const nx = up[0], later = up.slice(1);
  const showRec = !!vm.recommendation && (who === "all" || who === String(ownerId));

  const run = (fn: () => Promise<void>) => start(async () => { await fn(); });
  const pay = (v: VisitVM) => run(async () => { const r = await payVisitAction(v.id); if (r?.error) { setToast(r.error); router.refresh(); } });
  const bookFor = (personId: number, href: string) => run(async () => { await bookForAction(personId, href); });
  const openVisit = (v: VisitVM) => { setDlg({ kind: "visit", id: v.id }); setConfirm(false); };
  const openDoc = (d: DocVM) => {
    if (d.proc) return;
    setDlg({ kind: "doc", id: d.id });
    if (d.isNew && !read.includes(d.id)) { setRead(r => [...r, d.id]); void markReadAction(d.id); }
  };
  const toDocs = () => { setTab("docs"); setDocType("all"); };
  const closeDlg = () => { setDlg(null); setConfirm(false); };
  const doCancel = (v: VisitVM) => run(async () => {
    const r = await cancelVisitAction(v.id);
    closeDlg(); setToast(r.message); router.refresh();
  });

  const vRow = (v: VisitVM) => {
    const A: { label: string; run: () => void; p: boolean }[] = [];
    if (v.kind === "up") {
      A.push({ label: "Подробнее", run: () => openVisit(v), p: v.paid });
      if (!v.paid && v.payable) A.push({ label: `Оплатить ${v.prepay}`, run: () => pay(v), p: true });
    }
    if (v.docIds.length) {
      const d = vm.docs.find(x => x.id === v.docIds[0]);
      A.push({ label: v.docIds.length > 1 ? `Документы · ${v.docIds.length}` : "Документ", run: v.docIds.length > 1 || !d ? toDocs : () => openDoc(d), p: true });
    }
    if (v.kind !== "up" && v.bookAgainHref) { const href = v.bookAgainHref; A.push({ label: "Записаться снова", run: () => bookFor(v.who, href), p: false }); }
    return A;
  };

  const dv = dlg?.kind === "doc" ? vm.docs.find(d => d.id === dlg.id) : undefined;
  const vv = dlg?.kind === "visit" ? vm.visits.find(v => v.id === dlg.id) : undefined;
  const people = vm.people.length > 2 ? vm.people : [];

  return (
    <section style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      <div style={{ display: "flex", flexWrap: "wrap", gap: "16px 24px", alignItems: "flex-end", justifyContent: "space-between" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <span style={kicker}>Личный кабинет</span>
          <h1 style={{ margin: 0, fontSize: "var(--h2-size)", lineHeight: 1.02, letterSpacing: "-0.03em" }}>{vm.greeting}</h1>
        </div>
        {people.length > 0 && (
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {people.map(p => {
              const sel = who === p.key;
              return (
                <button key={p.key} onClick={() => setWho(p.key)} aria-pressed={sel} style={{ font: "inherit", display: "flex", alignItems: "center", gap: 8, padding: "5px 16px 5px 5px", cursor: "pointer", border: `2px solid ${sel ? acc : "transparent"}`, background: sel ? "var(--color-accent-100)" : sf, color: tx }}>
                  <span style={{ width: 34, height: 34, borderRadius: "50%", background: sel ? acc : "#fff", color: sel ? "#fff" : acc, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: 12 }}>{p.initial}</span>
                  <span style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", lineHeight: 1.15 }}><span style={{ fontWeight: 700, fontSize: 14 }}>{p.name}</span><span style={{ fontSize: 11, color: "var(--color-neutral-700)" }}>{p.sub}</span></span>
                </button>
              );
            })}
          </div>
        )}
      </div>

      <div role="tablist" style={{ display: "flex", gap: 4, padding: 4, background: sf, borderRadius: 999, overflowX: "auto", maxWidth: "100%", alignSelf: "flex-start" }}>
        {([["overview", "Обзор", 0], ["visits", "Записи", 0], ["docs", "Документы", newN], ["pays", "Платежи", 0], ["profile", "Профиль и семья", 0]] as const).map(([k, l, n]) => (
          <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)} style={{ font: "inherit", fontSize: 14, fontWeight: 700, whiteSpace: "nowrap", border: 0, padding: "10px 18px", cursor: "pointer", display: "flex", alignItems: "center", gap: 8, flex: "none", background: tab === k ? "#fff" : "transparent", color: tab === k ? tx : "var(--color-neutral-700)", boxShadow: tab === k ? "var(--shadow-sm)" : "none" }}>
            {l}<span style={{ display: n ? "inline-flex" : "none", minWidth: 20, height: 20, padding: "0 6px", borderRadius: 999, background: "var(--color-danger)", color: "#fff", fontSize: 11, fontWeight: 800, alignItems: "center", justifyContent: "center" }}>{n || ""}</span>
          </button>
        ))}
      </div>

      {tab === "overview" && <>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 16, alignItems: "stretch" }}>
          {nx ? (
            <div style={{ flex: "2 1 440px", minWidth: 0, background: acc, color: "#fff", borderRadius: 32, padding: 28, display: "flex", flexDirection: "column", gap: 20, minHeight: 260 }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
                <span style={{ fontSize: 12, letterSpacing: "0.08em", textTransform: "uppercase", opacity: 0.85 }}>Ближайший приём · {nx.whoName}</span>
                <span style={{ fontSize: 12, fontWeight: 700, padding: "6px 12px", borderRadius: 999, background: "rgba(255,255,255,0.16)" }}>{nx.paid || nx.payable ? nx.payLabel : nx.stLabel}</span>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                <span style={{ fontWeight: 800, fontSize: "var(--big-size)", lineHeight: 1, letterSpacing: "-0.03em" }}>{nx.nextWhen}</span>
                <span style={{ fontSize: 17, opacity: 0.92, textWrap: "pretty" }}>{nx.overviewLine}</span>
              </div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: "auto" }}>
                {!nx.paid && nx.payable ? <>
                  <button onClick={() => pay(nx)} disabled={pending} style={{ font: "inherit", fontWeight: 700, fontSize: 14, border: 0, padding: "12px 22px", cursor: "pointer", background: "#fff", color: acc }}>Оплатить {nx.prepay}</button>
                  <button onClick={() => openVisit(nx)} style={{ font: "inherit", fontWeight: 700, fontSize: 14, border: "1px solid rgba(255,255,255,0.55)", padding: "12px 22px", cursor: "pointer", background: "transparent", color: "#fff" }}>Подробнее</button>
                </> : <>
                  <button onClick={() => openVisit(nx)} style={{ font: "inherit", fontWeight: 700, fontSize: 14, border: 0, padding: "12px 22px", cursor: "pointer", background: "#fff", color: acc }}>Подробнее</button>
                  {nx.rescheduleHref && <button onClick={() => router.push(nx.rescheduleHref!)} style={{ font: "inherit", fontWeight: 700, fontSize: 14, border: "1px solid rgba(255,255,255,0.55)", padding: "12px 22px", cursor: "pointer", background: "transparent", color: "#fff" }}>Перенести</button>}
                </>}
              </div>
            </div>
          ) : (
            <div style={{ flex: "2 1 440px", minWidth: 0, background: sf, borderRadius: 32, padding: 28, display: "flex", flexDirection: "column", gap: 12, justifyContent: "center" }}>
              <span style={{ fontWeight: 800, fontSize: 26, letterSpacing: "-0.02em" }}>Предстоящих приёмов нет</span>
              <Link href="/" className="btn btn-primary" style={{ alignSelf: "flex-start" }}>Записаться к врачу →</Link>
            </div>
          )}
          <div style={{ flex: "1 1 280px", minWidth: 0, display: "flex", flexDirection: "column", gap: 16 }}>
            {later.filter(v => !v.paid && v.payable).map(v => (
              <div key={v.id} style={{ borderRadius: 28, padding: 22, display: "flex", flexDirection: "column", gap: 8, background: "var(--color-danger-100)" }}>
                <span style={{ fontSize: 12, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--color-danger)" }}>Ждёт оплаты до {v.deadline}</span>
                <span style={{ fontWeight: 800, fontSize: 18, lineHeight: 1.2 }}>{v.nextWhen}</span>
                <span style={{ fontSize: 14, color: "var(--color-neutral-800)" }}>{v.pendingLine}</span>
                <button className="btn btn-primary" onClick={() => pay(v)} disabled={pending} style={{ alignSelf: "flex-start", marginTop: 4 }}>Оплатить {v.prepay}</button>
              </div>
            ))}
            {later.some(v => v.paid || !v.payable) && (
              <div style={{ border: "1px solid var(--color-divider)", borderRadius: 28, padding: 22, display: "flex", flexDirection: "column", gap: 10 }}>
                <span style={kicker}>Дальше в плане</span>
                {later.filter(v => v.paid || !v.payable).map(v => (
                  <div key={v.id} {...clickable(() => openVisit(v))} className="hov-accent-100" style={{ display: "flex", flexDirection: "column", gap: 2, padding: "12px 14px", borderRadius: 18, background: sf, cursor: "pointer" }}>
                    <span style={{ fontWeight: 800, fontSize: 15 }}>{v.laterWhen}</span>
                    <span style={{ fontSize: 13, color: "var(--color-neutral-800)" }}>{v.pendingLine}</span>
                  </div>
                ))}
              </div>
            )}
            {docs.filter(d => d.proc).map(d => (
              <div key={d.id} style={{ borderRadius: 28, padding: 22, display: "flex", flexDirection: "column", gap: 6, background: sf }}>
                <span style={kicker}>Результат готовится</span>
                <span style={{ fontWeight: 800, fontSize: 17 }}>{d.title}</span>
                <span style={{ fontSize: 14, color: "var(--color-neutral-800)" }}>Будет готов {d.processingWhen} — пришлём СМС</span>
              </div>
            ))}
          </div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(min(100%,300px),1fr))", gap: 16 }}>
          <div style={{ border: "1px solid var(--color-divider)", borderRadius: 28, padding: 22, display: "flex", flexDirection: "column", gap: 12 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 12 }}>
              <span style={{ fontWeight: 800, fontSize: 18 }}>Новые документы</span>
              <span {...clickable(toDocs)} style={{ cursor: "pointer", fontSize: 14, fontWeight: 700, color: acc }}>Все →</span>
            </div>
            {docs.filter(d => d.isNew).map(d => (
              <div key={d.id} {...clickable(() => openDoc(d))} className="hov-accent-100" style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) auto", gap: "4px 12px", alignItems: "center", padding: "12px 14px", borderRadius: 18, background: sf, cursor: "pointer" }}>
                <span style={{ fontWeight: 700, fontSize: 15 }}>{d.title}</span>
                <span style={{ fontSize: 11, fontWeight: 800, color: "var(--color-danger)" }}>НОВОЕ</span>
                <span style={{ fontSize: 12, gridColumn: "1/-1", color: d.noteColor }}>{d.note}</span>
              </div>
            ))}
            {newN === 0 && <span style={{ fontSize: 14, color: "var(--color-neutral-700)" }}>Все документы просмотрены.</span>}
          </div>
          {showRec && vm.recommendation && (
            <div style={{ background: sf, borderRadius: 28, padding: 22, display: "flex", flexDirection: "column", gap: 10 }}>
              <span style={kicker}>Рекомендация врача</span>
              <span style={{ fontWeight: 800, fontSize: 20, lineHeight: 1.2, textWrap: "pretty" }}>{vm.recommendation.text}</span>
              <span style={{ fontSize: 14, color: "var(--color-neutral-800)" }}>{vm.recommendation.who}</span>
              <button className="btn btn-primary" onClick={() => bookFor(ownerId, vm.recommendation!.href)} disabled={pending} style={{ alignSelf: "flex-start", marginTop: "auto" }}>Выбрать время →</button>
            </div>
          )}
        </div>
      </>}

      {tab === "visits" && <>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {([["up", "Предстоящие", up.length], ["past", "Прошедшие", past.length], ["cancelled", "Отменённые", canc.length]] as const).map(([k, l, n]) => (
            <button key={k} onClick={() => setRec(k)} aria-pressed={rec === k} style={{ ...pillBtn, ...pill(rec === k) }}>{l}<span style={{ opacity: 0.7 }}>{n}</span></button>
          ))}
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {(rec === "up" ? up : rec === "past" ? past : canc).map(v => (
            <div key={v.id} className="cab-rec" style={{ display: "grid", gap: "14px 18px", alignItems: "center", padding: 16, border: "1px solid var(--color-divider)", borderRadius: 24, background: "#fff" }}>
              <div style={{ width: 68, height: 68, borderRadius: 20, background: v.kind === "up" ? acc : sf, color: v.kind === "up" ? "#fff" : tx, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 4, lineHeight: 1 }}>
                <span style={{ fontWeight: 800, fontSize: 24 }}>{v.dnum}</span><span style={{ fontSize: 11 }}>{v.dmon}</span>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 4, minWidth: 0 }}>
                <span style={{ fontWeight: 800, fontSize: 17, lineHeight: 1.2 }}>{v.svc}</span>
                <span style={{ fontSize: 14, color: "var(--color-neutral-800)" }}>{v.line}</span>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 4 }}>
                  <span className="tag" style={{ background: sf, color: "var(--color-neutral-800)", fontWeight: 600 }}>{v.whoName}</span>
                  <span className="tag" style={{ background: v.stBg, color: v.stFg, fontWeight: 600 }}>{v.stLabel}</span>
                </div>
                {v.note && <span style={{ fontSize: 12, color: "var(--color-neutral-700)" }}>{v.note}</span>}
              </div>
              <div className="cab-rec-act" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                <span style={{ fontWeight: 800, fontSize: 16, whiteSpace: "nowrap" }}>{v.price}</span>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  {vRow(v).map(a => (
                    <button key={a.label} onClick={a.run} disabled={pending} style={{ font: "inherit", fontSize: 13, fontWeight: 700, border: 0, padding: "9px 16px", cursor: "pointer", background: a.p ? acc : sf, color: a.p ? "#fff" : tx }}>{a.label}</button>
                  ))}
                </div>
              </div>
            </div>
          ))}
          {(rec === "up" ? up : rec === "past" ? past : canc).length === 0 && (
            <div style={{ padding: 28, borderRadius: 24, background: sf, fontSize: 15, color: "var(--color-neutral-800)" }}>
              {rec === "up" ? "Предстоящих записей нет." : rec === "past" ? "Прошедших приёмов пока нет." : "Отменённых записей нет."}
            </div>
          )}
        </div>
      </>}

      {tab === "docs" && <>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {([["all", "Все"], ["concl", "Заключения"], ["lab", "Анализы"], ["study", "Исследования"]] as const).map(([k, l]) => (
            <button key={k} onClick={() => setDocType(k)} aria-pressed={docType === k} style={{ ...pillBtn, ...pill(docType === k) }}>{l}<span style={{ opacity: 0.7 }}>{docs.filter(d => k === "all" || d.kind === k).length}</span></button>
          ))}
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(min(100%,260px),1fr))", gap: 14 }}>
          {docs.filter(d => docType === "all" || d.kind === docType).map(d => (
            <div key={d.id} {...(d.proc ? {} : clickable(() => openDoc(d)))} className="hov-shadow-md" style={{ cursor: d.proc ? "default" : "pointer", border: "1px solid var(--color-divider)", borderRadius: 24, padding: 20, display: "flex", flexDirection: "column", gap: 12, background: "#fff" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
                <span style={{ fontSize: 12, fontWeight: 700, padding: "5px 12px", borderRadius: 999, background: d.typeBg, color: d.typeFg }}>{d.typeLabel}</span>
                {d.isNew && <span style={{ fontSize: 11, fontWeight: 800, color: "var(--color-danger)" }}>НОВОЕ</span>}
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}><span style={{ fontWeight: 800, fontSize: 18, lineHeight: 1.2 }}>{d.title}</span><span style={{ fontSize: 13, color: "var(--color-neutral-700)" }}>{d.meta}</span></div>
              <span style={{ fontSize: 13, fontWeight: 600, color: d.noteColor }}>{d.note}</span>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, marginTop: "auto", paddingTop: 12, borderTop: "1px solid var(--color-divider)" }}>
                <span style={{ fontSize: 12, fontWeight: 600, padding: "4px 10px", borderRadius: 999, background: sf }}>{d.whoName}</span>
                <span style={{ fontWeight: 700, fontSize: 14, color: d.ctaColor }}>{d.cta}</span>
              </div>
            </div>
          ))}
        </div>
        <span style={{ fontSize: 13, color: "var(--color-neutral-700)", textWrap: "pretty" }}>Заключения появляются после приёма, анализы — когда будут готовы. Оригиналы с печатью — в регистратуре.</span>
      </>}

      {tab === "pays" && <>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 16 }}>
          <div style={{ flex: "1 1 300px", background: acc, color: "#fff", borderRadius: 32, padding: 28, display: "flex", flexDirection: "column", gap: 8 }}>
            <span style={{ fontSize: 12, letterSpacing: "0.08em", textTransform: "uppercase", opacity: 0.85 }}>Оплачено в {vm.payYear} году</span>
            <span style={{ fontWeight: 800, fontSize: "var(--big-size)", lineHeight: 1, letterSpacing: "-0.03em" }}>{who === "all" ? vm.payTotal : rub(total)}</span>
            <span style={{ fontSize: 14, opacity: 0.9 }}>{who === "all" ? vm.payTotalSubAll : "С учётом возвратов"}</span>
          </div>
          <div style={{ flex: "1 1 300px", background: sf, borderRadius: 32, padding: 28, display: "flex", flexDirection: "column", gap: 10 }}>
            <span style={{ fontWeight: 800, fontSize: 20 }}>Справка для налогового вычета</span>
            <span style={{ fontSize: 14, color: "var(--color-neutral-800)", textWrap: "pretty" }}>Справка об оплате медицинских услуг для налоговой — за себя и за детей.</span>
            {vm.taxDoneText
              ? <span style={{ marginTop: "auto", fontSize: 14, fontWeight: 600, color: "var(--color-success)", textWrap: "pretty" }}>{vm.taxDoneText}</span>
              : <button className="btn btn-primary" disabled={pending} onClick={() => run(async () => { await cabinetRequestAction("tax"); router.refresh(); })} style={{ alignSelf: "flex-start", marginTop: "auto" }}>Заказать справку за {vm.payYear} год</button>}
          </div>
        </div>
        {pays.length > 0 && (
          <div style={{ display: "flex", flexDirection: "column", border: "1px solid var(--color-divider)", borderRadius: 24, overflow: "hidden" }}>
            {pays.map(p => (
              <div key={p.receiptHref} className="cab-pay" style={{ display: "grid", gap: 12, alignItems: "center", padding: "14px 20px", borderBottom: "1px solid var(--color-divider)" }}>
                <span className="cab-pay-date" style={{ fontSize: 13, color: "var(--color-neutral-700)" }}>{p.date}</span>
                <div style={{ display: "flex", flexDirection: "column", minWidth: 0 }}>
                  <span style={{ fontWeight: 600, fontSize: 15 }}>{p.what}</span>
                  <span className="only-desk" style={{ fontSize: 12, color: "var(--color-neutral-700)" }}>{p.sub}</span>
                  <span className="only-mob" style={{ fontSize: 12, color: "var(--color-neutral-700)" }}>{p.subMobile}</span>
                </div>
                <span style={{ fontWeight: 800, fontSize: 16, whiteSpace: "nowrap", textAlign: "right", color: p.amountColor }}>{p.amount}</span>
                <Link href={p.receiptHref} style={{ fontSize: 13, fontWeight: 700, textDecoration: "none" }}>Чек</Link>
              </div>
            ))}
          </div>
        )}
      </>}

      {tab === "profile" && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(min(100%,320px),1fr))", gap: 16, alignItems: "start" }}>
          <div style={{ border: "1px solid var(--color-divider)", borderRadius: 28, padding: 24, display: "flex", flexDirection: "column", gap: 14 }}>
            <span style={{ fontWeight: 800, fontSize: 20 }}>Личные данные</span>
            <div style={{ display: "flex", flexDirection: "column" }}>
              {vm.profileRows.map(r => (
                <div key={r.k} style={{ display: "flex", justifyContent: "space-between", gap: 12, padding: "10px 0", borderBottom: "1px solid var(--color-divider)", fontSize: 14 }}><span style={{ color: "var(--color-neutral-700)" }}>{r.k}</span><span style={{ fontWeight: 600, textAlign: "right" }}>{r.v}</span></div>
              ))}
            </div>
            <div className="field">
              <label htmlFor="cab-email">Email для чеков</label>
              <input id="cab-email" className="input" type="email" autoComplete="email" value={email} placeholder="name@mail.ru" style={{ minHeight: 46 }}
                onChange={e => setEmail(e.target.value)}
                onBlur={() => {
                  if (email.trim() === savedEmail) return;
                  run(async () => {
                    const r = await updateAccountAction({ email: email.trim() });
                    if (r.error) setToast(r.error); else { setSavedEmail(email.trim()); setToast(email.trim() ? "Email для чеков сохранён" : "Email удалён"); }
                  });
                }} />
            </div>
            <span style={{ fontSize: 12, color: "var(--color-neutral-700)", textWrap: "pretty" }}>ФИО и дату рождения меняет регистратура по паспорту — чтобы документы и чеки совпадали.</span>
          </div>
          <div style={{ border: "1px solid var(--color-divider)", borderRadius: 28, padding: 24, display: "flex", flexDirection: "column", gap: 12 }}>
            <span style={{ fontWeight: 800, fontSize: 20 }}>Семья</span>
            {vm.family.map(m => (
              <div key={m.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: 10, borderRadius: 20, background: sf }}>
                <span style={{ width: 44, height: 44, borderRadius: "50%", background: m.isOwner ? acc : "#fff", color: m.isOwner ? "#fff" : acc, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, flex: "none" }}>{m.initial}</span>
                <div style={{ display: "flex", flexDirection: "column", minWidth: 0, flex: 1 }}><span style={{ fontWeight: 700, fontSize: 15 }}>{m.full}</span><span style={{ fontSize: 12, color: "var(--color-neutral-700)" }}>{m.sub}</span></div>
                <button onClick={() => bookFor(m.id, "/")} disabled={pending} style={{ font: "inherit", fontSize: 13, fontWeight: 700, border: 0, padding: "8px 14px", cursor: "pointer", background: "#fff", color: acc, flex: "none" }}>Записать</button>
              </div>
            ))}
            <button onClick={() => run(async () => { await cabinetRequestAction("child"); setToast("Заявка отправлена — подтвердим в регистратуре по свидетельству о рождении"); })} disabled={pending}
              style={{ font: "inherit", fontSize: 14, fontWeight: 700, border: "2px dashed var(--color-neutral-300)", background: "transparent", padding: 12, cursor: "pointer", color: acc, borderRadius: 20 }}>+ Добавить ребёнка</button>
            <span style={{ fontSize: 12, color: "var(--color-neutral-700)", textWrap: "pretty" }}>Взрослые родственники ведут свой кабинет — их медицинские данные видны только им.</span>
          </div>
          <div style={{ border: "1px solid var(--color-divider)", borderRadius: 28, padding: 24, display: "flex", flexDirection: "column", gap: 10 }}>
            <span style={{ fontWeight: 800, fontSize: 20 }}>Уведомления</span>
            {vm.notifs.map(n => {
              const on = notif[n.key];
              return (
                <div key={n.key} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 16, padding: "6px 0" }}>
                  <div style={{ display: "flex", flexDirection: "column" }}><span style={{ fontWeight: 600, fontSize: 15 }}>{n.label}</span><span style={{ fontSize: 12, color: "var(--color-neutral-700)" }}>{n.sub}</span></div>
                  <button role="switch" aria-checked={on} aria-label={n.label}
                    onClick={() => {
                      setNotif(s => ({ ...s, [n.key]: !on }));
                      run(async () => { const r = await updateAccountAction({ [n.key]: !on }); if (r.error) { setNotif(s => ({ ...s, [n.key]: on })); setToast(r.error); } });
                    }}
                    style={{ flex: "none", width: 48, height: 28, border: 0, padding: 3, cursor: "pointer", display: "flex", justifyContent: on ? "flex-end" : "flex-start", background: on ? acc : "var(--color-neutral-300)" }}>
                    <span style={{ width: 22, height: 22, borderRadius: "50%", background: "#fff", boxShadow: "var(--shadow-sm)" }} />
                  </button>
                </div>
              );
            })}
          </div>
          <div style={{ border: "1px solid var(--color-divider)", borderRadius: 28, padding: 24, display: "flex", flexDirection: "column", gap: 6 }}>
            <span style={{ fontWeight: 800, fontSize: 20, marginBottom: 4 }}>Согласия</span>
            {vm.consents.map(c => (
              <div key={c.title} style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", padding: "10px 0", borderBottom: "1px solid var(--color-divider)" }}>
                <div style={{ display: "flex", flexDirection: "column", minWidth: 0 }}><span style={{ fontWeight: 600, fontSize: 14 }}>{c.title}</span><span style={{ fontSize: 12, color: "var(--color-neutral-700)" }}>{c.sub}</span></div>
                <Link href={c.href} style={{ fontSize: 13, fontWeight: 700, textDecoration: "none", flex: "none" }}>Открыть</Link>
              </div>
            ))}
            <form action={logoutAction} style={{ alignSelf: "flex-start", marginTop: 10 }}>
              <button type="submit" className="btn btn-secondary">Выйти из кабинета</button>
            </form>
          </div>
        </div>
      )}

      {dv && (
        <div className="dialog-backdrop" onClick={closeDlg} style={{ zIndex: 20 }}>
          <div className="dialog" role="dialog" aria-modal="true" aria-label={dv.title} onClick={e => e.stopPropagation()} style={{ width: "min(640px,100%)", maxHeight: "calc(100vh - 32px)", overflow: "auto", gap: 18 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
              <span style={{ fontSize: 12, fontWeight: 700, padding: "5px 12px", borderRadius: 999, background: dv.typeBg, color: dv.typeFg }}>{dv.typeLabel}</span>
              <button onClick={closeDlg} aria-label="Закрыть" style={closeBtn}>×</button>
            </div>
            <span style={{ fontWeight: 800, fontSize: 28, lineHeight: 1.1, letterSpacing: "-0.02em" }}>{dv.title}</span>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))", gap: 8 }}>
              {dv.dialog.meta.map(m => (
                <div key={m.k} style={{ background: sf, borderRadius: 16, padding: "10px 14px", display: "flex", flexDirection: "column", gap: 2 }}><span style={{ fontSize: 11, color: "var(--color-neutral-700)" }}>{m.k}</span><span style={{ fontWeight: 700, fontSize: 14 }}>{m.v}</span></div>
              ))}
            </div>
            {dv.kind !== "lab" && (dv.dialog.sections.length > 0 || dv.dialog.recs.length > 0) && (
              <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                {dv.dialog.sections.map(x => (
                  <div key={x.k} style={{ display: "flex", flexDirection: "column", gap: 4 }}><span style={{ fontSize: 12, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--color-neutral-700)" }}>{x.k}</span><span style={{ fontSize: 15, textWrap: "pretty" }}>{x.v}</span></div>
                ))}
                {dv.dialog.recs.length > 0 && (
                  <div style={{ display: "flex", flexDirection: "column", gap: 10, padding: 18, borderRadius: 20, background: "var(--color-accent-100)" }}>
                    <span style={{ fontWeight: 800, fontSize: 15, color: "var(--color-accent-700)" }}>Рекомендации</span>
                    {dv.dialog.recs.map((r, i) => (
                      <div key={i} style={{ display: "grid", gridTemplateColumns: "24px minmax(0,1fr)", gap: 10, fontSize: 14, alignItems: "start" }}><span style={{ width: 22, height: 22, borderRadius: "50%", background: acc, color: "#fff", fontSize: 12, fontWeight: 800, display: "flex", alignItems: "center", justifyContent: "center" }}>{i + 1}</span><span style={{ textWrap: "pretty" }}>{r}</span></div>
                    ))}
                  </div>
                )}
              </div>
            )}
            {dv.kind === "lab" && <>
              <div style={{ flex: "none", display: "flex", flexDirection: "column", border: "1px solid var(--color-divider)", borderRadius: 20, overflow: "hidden" }}>
                <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1.4fr) minmax(0,0.9fr) minmax(0,1fr)", gap: 8, padding: "10px 16px", fontSize: 11, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--color-neutral-700)", background: sf }}><span>Показатель</span><span>Результат</span><span>Норма</span></div>
                {dv.dialog.rows.map(r => (
                  <div key={r.name} style={{ display: "grid", gridTemplateColumns: "minmax(0,1.4fr) minmax(0,0.9fr) minmax(0,1fr)", gap: 8, padding: "12px 16px", borderTop: "1px solid var(--color-divider)", fontSize: 14, alignItems: "baseline", background: r.bad ? "var(--color-danger-100)" : "transparent" }}>
                    <span style={{ fontWeight: 600 }}>{r.name}</span>
                    <span style={{ fontWeight: 800, color: r.bad ? "var(--color-danger)" : tx }}>{r.val} {r.bad ? "↑" : ""} <span style={{ fontWeight: 400, fontSize: 12, color: "var(--color-neutral-700)" }}>{r.unit}</span></span>
                    <span style={{ fontSize: 13, color: "var(--color-neutral-700)" }}>{r.ref}</span>
                  </div>
                ))}
              </div>
              <span style={{ fontSize: 13, color: "var(--color-neutral-700)", textWrap: "pretty" }}>Результаты расшифровывает лечащий врач — покажите их на приёме.</span>
            </>}
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {dv.dialog.next && <button className="btn btn-primary" disabled={pending} onClick={() => bookFor(dv.who, dv.dialog.next!.href)}><span>Записаться: {dv.dialog.next.text.toLowerCase()}</span> →</button>}
              <a className="btn btn-secondary" href={`/kabinet/dokument/${dv.id}`} target="_blank" rel="noopener">Скачать PDF</a>
            </div>
          </div>
        </div>
      )}

      {vv && (
        <div className="dialog-backdrop" onClick={closeDlg} style={{ zIndex: 20 }}>
          <div className="dialog" role="dialog" aria-modal="true" aria-label={vv.dialog.when} onClick={e => e.stopPropagation()} style={{ width: "min(560px,100%)", maxHeight: "calc(100vh - 32px)", overflow: "auto", gap: 16 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
              <span className="tag" style={{ background: vv.stBg, color: vv.stFg, fontWeight: 700 }}>{vv.stLabel}</span>
              <button onClick={closeDlg} aria-label="Закрыть" style={closeBtn}>×</button>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}><span style={{ fontWeight: 800, fontSize: 28, lineHeight: 1.1, letterSpacing: "-0.02em" }}>{vv.dialog.when}</span><span style={{ fontSize: 15, color: "var(--color-neutral-800)" }}>{vv.dialog.line}</span></div>
            <div style={{ display: "flex", flexDirection: "column" }}>
              {vv.dialog.rows.map(r => (
                <div key={r.k} style={{ display: "flex", justifyContent: "space-between", gap: 16, padding: "10px 0", borderBottom: "1px solid var(--color-divider)", fontSize: 14 }}><span style={{ color: "var(--color-neutral-700)" }}>{r.k}</span><span style={{ fontWeight: 600, textAlign: "right" }}>{r.v}</span></div>
              ))}
            </div>
            {vv.dialog.prep && <div style={{ background: sf, borderRadius: 18, padding: "14px 16px", display: "flex", flexDirection: "column", gap: 4 }}><span style={{ fontWeight: 800, fontSize: 14 }}>Подготовка</span><span style={{ fontSize: 14, textWrap: "pretty" }}>{vv.dialog.prep}</span></div>}
            {!confirm && vv.kind === "up" && (
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {!vv.paid && vv.payable && <button className="btn btn-primary" disabled={pending} onClick={() => pay(vv)}>Оплатить {vv.prepay}</button>}
                {vv.rescheduleHref && <Link className="btn btn-secondary" href={vv.rescheduleHref}>Перенести</Link>}
                {vv.canCancel && <button className="btn btn-secondary" onClick={() => setConfirm(true)} style={{ color: "var(--color-danger)" }}>Отменить запись</button>}
              </div>
            )}
            {confirm && (
              <div style={{ background: "var(--color-danger-100)", borderRadius: 20, padding: "16px 18px", display: "flex", flexDirection: "column", gap: 10 }}>
                <span style={{ fontWeight: 800, fontSize: 16 }}>Отменить запись?</span>
                <span style={{ fontSize: 14, textWrap: "pretty" }}>{vv.dialog.cancelText}</span>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <button className="btn" disabled={pending} onClick={() => doCancel(vv)} style={{ background: "var(--color-danger)", color: "#fff" }}>Да, отменить</button>
                  <button className="btn btn-secondary" onClick={() => setConfirm(false)} style={{ background: "#fff" }}>Оставить</button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      <Toast message={toast} onDone={clearToast} />
    </section>
  );
}

