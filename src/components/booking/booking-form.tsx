"use client";
// Данные для записи — экран «isForm» прототипа: кто придёт, поля с масками,
// способ предоплаты, подготовка, согласия и сводка.
import { useState, useTransition } from "react";
import Link from "next/link";
import { maskPhone, maskDob, fieldErrors, dobHint, CONSENT_ERROR, type FormV2, type Who } from "@/lib/forms/booking-v2";
import { plural } from "@/lib/format";
import { SummaryRows, asideStyle, kicker, type SummaryRow } from "./summary";

export type StartPayload = { who: Who; form: FormV2; consentPd: boolean; consentPrepay: boolean; payChoice: "online" | "reserve" };
export type StartState = { errors: Record<string, string> };

const acc = "var(--color-accent)";
const WHO: [Who, string, string][] = [
  ["self", "Я", "Записываюсь на приём сам"],
  ["child", "Ребёнок", "До 18 лет — запишет родитель или опекун"],
  ["other", "Другой взрослый", "Родственник или знакомый — согласие даст сам по СМС"],
];
type Field = keyof FormV2;

export function BookingForm(props: {
  backHref: string; today: string; summary: SummaryRow[]; prepayLabel: string; prep: string | null;
  payModel: "both" | "online" | "reserve"; deadlineLabel: string | null; consentEdition: string;
  initial: Partial<StartPayload> | null; action: (p: StartPayload) => Promise<StartState>;
}) {
  const [who, setWho] = useState<Who>(props.initial?.who ?? "self");
  const [f, setF] = useState<FormV2>({ fio: "", dob: "", phone: "", repFio: "", phone2: "", ...props.initial?.form });
  const [touched, setTouched] = useState<Partial<Record<Field, boolean>>>({});
  const [tried, setTried] = useState(false);
  const [c1, setC1] = useState(false);
  const [c2, setC2] = useState(false);
  const [pay, setPay] = useState<"online" | "reserve">(props.initial?.payChoice ?? "online");
  const [serverErr, setServerErr] = useState<Record<string, string>>({});
  const [pending, startTransition] = useTransition();

  const cashAllowed = props.deadlineLabel != null;
  const effPay = props.payModel === "online" ? "online" : props.payModel === "reserve" ? (cashAllowed ? "reserve" : "online") : (pay === "reserve" && !cashAllowed ? "online" : pay);
  const fe = { ...fieldErrors(who, f, props.today), ...serverErr } as Record<string, string>;
  const consentErr = tried && (!c1 || !c2);
  const nErr = Object.keys(fieldErrors(who, f, props.today)).length + (!c1 || !c2 ? 1 : 0);
  const formHasErr = tried && nErr > 0;
  const show = (k: Field) => ((tried || touched[k]) && fe[k]) || "";
  const set = (k: Field, raw: string) => {
    const v = k === "phone" || k === "phone2" ? maskPhone(raw) : k === "dob" ? maskDob(raw) : raw;
    setF(prev => ({ ...prev, [k]: v }));
    if (serverErr[k]) setServerErr(prev => Object.fromEntries(Object.entries(prev).filter(([key]) => key !== k)));
  };
  const hint = dobHint(who, f, props.today);
  const chk = (v: boolean) => ({ b: v ? acc : consentErr ? "var(--color-danger)" : "var(--color-neutral-400)", bg: v ? acc : "#fff", m: v ? "✓" : "" });
  const k1 = chk(c1), k2 = chk(c2);

  const input = (k: Field, label: string, extra: React.InputHTMLAttributes<HTMLInputElement> & { full?: boolean } = {}) => {
    const { full, ...attrs } = extra;
    const err = show(k);
    const text = err || (k === "dob" && hint ? hint : "");
    return (
      <div className="field" style={full ? { gridColumn: "1/-1" } : undefined}>
        <label htmlFor={`f-${k}`}>{label}</label>
        <input id={`f-${k}`} className="input" value={f[k]} onChange={e => set(k, e.target.value)} onBlur={() => setTouched(t => ({ ...t, [k]: true }))}
          aria-invalid={err ? true : undefined} {...attrs}
          style={{ minHeight: 48, borderColor: err ? "var(--color-danger)" : "transparent", background: err ? "var(--color-danger-100)" : "var(--color-surface)" }} />
        <span style={{ display: "block", minHeight: 18, marginTop: 4, fontSize: 12, color: !err && text ? "var(--color-neutral-700)" : "var(--color-danger)" }}>{text}</span>
      </div>
    );
  };

  const submit = () => {
    setTried(true);
    if (nErr > 0) return;
    startTransition(async () => {
      const r = await props.action({ who, form: f, consentPd: c1, consentPrepay: c2, payChoice: effPay });
      setServerErr(r.errors);
    });
  };

  const payOpts = [
    { k: "online" as const, title: "Оплатить онлайн сейчас", sub: "Картой или по СБП. Запись подтверждается сразу, чек придёт в СМС.", dis: false },
    { k: "reserve" as const, title: cashAllowed ? `Забронировать, оплатить до ${props.deadlineLabel}` : "Бронь недоступна",
      sub: cashAllowed ? "Наличными в регистратуре или по ссылке из СМС. Не успеете — время освободится." : "Приём слишком скоро: касса не успеет открыться. Доступна только онлайн-оплата.",
      dis: !cashAllowed || props.payModel === "online" },
  ].filter(p => props.payModel !== "reserve" || p.k === "reserve" || !cashAllowed);

  return (
    <section style={{ display: "flex", flexWrap: "wrap", gap: 32, alignItems: "flex-start" }}>
      <div style={{ flex: "1 1 520px", minWidth: 0, display: "flex", flexDirection: "column", gap: 28 }}>
        <Link href={props.backHref} className="plain-link" style={{ cursor: "pointer", fontSize: 14, color: "var(--color-accent-700)" }}>← Изменить время</Link>
        <h2 style={{ margin: 0, fontSize: "var(--h2-size)", letterSpacing: "-0.025em" }}>Данные для записи</h2>

        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <span style={kicker}>Кто придёт на приём</span>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(170px,1fr))", gap: 10 }}>
            {WHO.map(([k, l, sub]) => {
              const sel = who === k;
              return (
                <button key={k} type="button" onClick={() => setWho(k)} aria-pressed={sel}
                  style={{ font: "inherit", textAlign: "left", borderRadius: 20, border: `2px solid ${sel ? acc : "var(--color-neutral-300)"}`, padding: "14px 16px", cursor: "pointer", display: "grid", gridTemplateColumns: "20px minmax(0,1fr)", gap: 10, alignItems: "start", background: sel ? "var(--color-accent-100)" : "#fff", color: "var(--color-text)" }}>
                  <span style={{ width: 20, height: 20, borderRadius: "50%", border: `2px solid ${sel ? acc : "var(--color-neutral-400)"}`, background: sel ? acc : "#fff", boxShadow: "inset 0 0 0 3px #fff", marginTop: 1 }} />
                  <span style={{ display: "flex", flexDirection: "column", gap: 3 }}><span style={{ fontWeight: 800, fontSize: 15, lineHeight: 1.25 }}>{l}</span><span style={{ fontSize: 12, lineHeight: 1.35, color: "var(--color-neutral-700)", textWrap: "pretty" }}>{sub}</span></span>
                </button>
              );
            })}
          </div>
          {who === "other" && <span style={{ fontSize: 13, color: "var(--color-neutral-800)", textWrap: "pretty" }}>Согласие на обработку данных взрослый даёт сам. Мы пришлём ему СМС со ссылкой — запись подтвердится после его согласия.</span>}
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))", gap: 16 }}>
          {who === "child" && input("repFio", "ФИО родителя или законного представителя", { full: true, autoComplete: "name", placeholder: "Иванова Мария Петровна" })}
          {input("fio", who === "self" ? "ФИО" : "ФИО пациента", { full: true, autoComplete: who === "self" ? "name" : "off", placeholder: "Фамилия Имя Отчество" })}
          {input("dob", "Дата рождения пациента", { inputMode: "numeric", placeholder: "дд.мм.гггг" })}
          {input("phone", who === "self" ? "Телефон" : "Ваш телефон — для СМС", { type: "tel", inputMode: "numeric", autoComplete: "tel", placeholder: "+7 900 000-00-00" })}
          {who === "other" && input("phone2", "Телефон пациента — для согласия", { full: true, type: "tel", inputMode: "numeric", placeholder: "+7 900 000-00-00" })}
        </div>

        {props.payModel !== "online" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <span style={kicker}>Как внести предоплату {props.prepayLabel}</span>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(240px,1fr))", gap: 14, background: "transparent" }}>
              {payOpts.map(p => {
                const sel = effPay === p.k;
                return (
                  <button key={p.k} type="button" onClick={() => setPay(p.k)} disabled={p.dis}
                    style={{ font: "inherit", textAlign: "left", borderRadius: 20, border: `2px solid ${sel ? acc : "var(--color-neutral-300)"}`, padding: "16px 18px", cursor: "pointer", display: "grid", gridTemplateColumns: "20px minmax(0,1fr)", gap: 12, alignItems: "start", background: sel ? "var(--color-accent-100)" : "#fff", color: "var(--color-text)", opacity: p.dis ? 0.55 : 1 }}>
                    <span style={{ width: 20, height: 20, borderRadius: "50%", border: `2px solid ${sel ? acc : "var(--color-neutral-400)"}`, background: sel ? acc : "#fff", boxShadow: "inset 0 0 0 3px #fff", marginTop: 1 }} />
                    <span style={{ display: "flex", flexDirection: "column", gap: 4 }}><span style={{ fontWeight: 800, fontSize: 16, lineHeight: 1.25 }}>{p.title}</span><span style={{ fontSize: 13, lineHeight: 1.4, color: "var(--color-neutral-700)", textWrap: "pretty" }}>{p.sub}</span></span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {props.prep && (
          <div style={{ background: "var(--color-surface)", padding: 16, display: "flex", flexDirection: "column", gap: 6, borderRadius: 24 }}>
            <span style={{ fontWeight: 800, fontSize: 15 }}>Подготовка к исследованию</span>
            <span style={{ fontSize: 14, textWrap: "pretty" }}>{props.prep}</span>
          </div>
        )}

        <div style={{ display: "flex", flexDirection: "column", gap: 12, padding: "16px 18px", borderRadius: 20, border: `1px solid ${consentErr ? "var(--color-danger)" : "transparent"}`, background: consentErr ? "var(--color-danger-100)" : "var(--color-surface)" }}>
          <label onClick={e => { if ((e.target as HTMLElement).tagName !== "A") { e.preventDefault(); setC1(!c1); } }} style={{ display: "grid", gridTemplateColumns: "24px minmax(0,1fr)", gap: 10, cursor: "pointer", fontSize: 14, alignItems: "start" }}>
            <span role="checkbox" aria-checked={c1} tabIndex={0} onKeyDown={e => { if (e.key === " ") { e.preventDefault(); setC1(!c1); } }} style={{ width: 22, height: 22, borderRadius: 7, border: `2px solid ${k1.b}`, background: k1.bg, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 800 }}>{k1.m}</span>
            <span>Даю <a href="/dokumenty/soglasie-pd" target="_blank">согласие на обработку персональных данных</a> {who === "child" ? "моих и ребёнка" : ""} (отдельный документ, ред. от {props.consentEdition})</span>
          </label>
          <label onClick={e => { if ((e.target as HTMLElement).tagName !== "A") { e.preventDefault(); setC2(!c2); } }} style={{ display: "grid", gridTemplateColumns: "24px minmax(0,1fr)", gap: 10, cursor: "pointer", fontSize: 14, alignItems: "start" }}>
            <span role="checkbox" aria-checked={c2} tabIndex={0} onKeyDown={e => { if (e.key === " ") { e.preventDefault(); setC2(!c2); } }} style={{ width: 22, height: 22, borderRadius: 7, border: `2px solid ${k2.b}`, background: k2.bg, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 800 }}>{k2.m}</span>
            <span>Ознакомлен с <a href="/dokumenty/predoplata" target="_blank">условиями предоплаты</a>: {props.prepayLabel} засчитываются в стоимость приёма; при отмене предоплата возвращается</span>
          </label>
          {consentErr && (
            <span style={{ fontSize: 13, fontWeight: 600, color: "var(--color-danger)", display: "flex", gap: 8, alignItems: "center" }}>
              <span style={{ width: 18, height: 18, borderRadius: "50%", background: "var(--color-danger)", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 800, flex: "none" }}>!</span>{CONSENT_ERROR}
            </span>
          )}
        </div>
      </div>

      <aside style={asideStyle}>
        <span style={kicker}>Ваша запись</span>
        <SummaryRows rows={props.summary} />
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}><span style={{ fontSize: 14 }}>Предоплата</span><span style={{ fontWeight: 800, fontSize: 26 }}>{props.prepayLabel}</span></div>
        <span style={{ fontSize: 12, color: "var(--color-neutral-700)" }}>{effPay === "online" ? "Код и ссылку на оплату пришлём одним СМС." : `Время закрепим за вами до ${props.deadlineLabel}.`}</span>
        {formHasErr && <span style={{ fontSize: 13, fontWeight: 600, color: "var(--color-danger)" }}>{nErr === 1 ? "Исправьте отмеченное красным" : `Исправьте отмеченное красным — ${nErr} ${plural(nErr, "пункт", "пункта", "пунктов")}`}</span>}
        {serverErr._form && <span role="alert" style={{ fontSize: 13, fontWeight: 600, color: "var(--color-danger)" }}>{serverErr._form}</span>}
        <button className="btn btn-primary" onClick={submit} disabled={pending} style={{ padding: "14px 16px", fontSize: 15, justifyContent: "space-between" }}>{pending ? "Отправляем код…" : "Получить код по СМС"}<span>→</span></button>
      </aside>
    </section>
  );
}
