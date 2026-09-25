"use client";
// «Подтвердите телефон» — экран «isPay/payCode» прототипа.
import { useEffect, useState, useTransition } from "react";

export function CodeForm(props: {
  phone: string; cta: string; resendAt: string; devHint: boolean;
  confirm: (code: string) => Promise<{ error: string }>;
  resend: () => Promise<{ error: string | null; resendAt: string | null }>;
  changeNumber: () => Promise<void>;
}) {
  const [code, setCode] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [resendAt, setResendAt] = useState(() => new Date(props.resendAt).getTime());
  const [now, setNow] = useState(() => Date.now());
  const [pending, startTransition] = useTransition();
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const left = Math.max(0, Math.ceil((resendAt - now) / 1000));
  const check = () => startTransition(async () => { const r = await props.confirm(code); setErr(r.error); });
  const resend = () => startTransition(async () => {
    const r = await props.resend();
    setErr(r.error);
    if (r.resendAt) setResendAt(new Date(r.resendAt).getTime());
  });

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <h2 style={{ margin: 0, fontSize: "var(--h2-size)", letterSpacing: "-0.025em" }}>Подтвердите телефон</h2>
      <p style={{ margin: 0, fontSize: 15, textWrap: "pretty" }}>Отправили СМС на {props.phone}. В нём код и ссылка на оплату — если закроете страницу, оплатить можно по ссылке.</p>
      <div className="field">
        <label htmlFor="sms-code">Код из СМС</label>
        <input id="sms-code" className="input" value={code} inputMode="numeric" autoComplete="one-time-code" placeholder="4 цифры"
          onChange={e => { setCode(e.target.value.replace(/\D/g, "").slice(0, 4)); setErr(null); }}
          onKeyDown={e => { if (e.key === "Enter" && code.length === 4) check(); }}
          style={{ minHeight: 56, fontSize: 28, fontWeight: 800, letterSpacing: "0.3em", maxWidth: 220, borderColor: err ? "var(--color-danger)" : "transparent" }} />
      </div>
      <span style={{ fontSize: 12, color: err ? "var(--color-danger)" : "var(--color-neutral-700)" }}>
        {err ?? (left > 0 ? `Отправить повторно через 0:${String(left).padStart(2, "0")}` : "")}
        {!err && left === 0 && <button type="button" onClick={resend} disabled={pending} className="btn-ghost" style={{ font: "inherit", fontSize: 12, border: 0, background: "transparent", color: "var(--color-accent)", cursor: "pointer", padding: 0 }}>Отправить код ещё раз</button>}
        {!err && props.devHint && " · код — в логе сервера (СМС-заглушка)"}
      </span>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button className="btn btn-primary" onClick={check} disabled={pending || code.length !== 4} style={{ padding: "14px 16px", fontSize: 15, minWidth: 240, justifyContent: "space-between" }}>{props.cta}<span>→</span></button>
        <button className="btn btn-secondary" onClick={() => startTransition(() => props.changeNumber())} disabled={pending} style={{ padding: "14px 16px" }}>Изменить номер</button>
      </div>
    </div>
  );
}
