"use client";
import { useState, useTransition } from "react";
import { loginStaffAction } from "../actions";

export function StaffLoginForm() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <form onSubmit={e => { e.preventDefault(); start(async () => { const r = await loginStaffAction(email, password); if (r?.error) setErr(r.error); }); }}
      style={{ width: "100%", maxWidth: 460, background: "var(--color-surface)", borderRadius: 32, padding: 32, display: "flex", flexDirection: "column", gap: 16, boxSizing: "border-box" }}>
      <span style={{ fontSize: 12, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--color-neutral-700)" }}>Регистратура</span>
      <h2 style={{ margin: 0, fontSize: 32, lineHeight: 1.05, letterSpacing: "-0.025em" }}>Вход в CRM</h2>
      <p style={{ margin: 0, fontSize: 15, color: "var(--color-neutral-800)", textWrap: "pretty" }}>Рабочая почта и пароль, которые выдал старший администратор. Сессия длится смену — 12 часов.</p>
      <div className="field"><label htmlFor="st-email">Почта</label>
        <input id="st-email" className="input" type="email" autoComplete="username" value={email} onChange={e => { setEmail(e.target.value); setErr(null); }} placeholder="name@lotos74.ru" style={{ minHeight: 52, fontSize: 16, background: "#fff" }} /></div>
      <div className="field"><label htmlFor="st-pass">Пароль</label>
        <input id="st-pass" className="input" type="password" autoComplete="current-password" value={password} onChange={e => { setPassword(e.target.value); setErr(null); }} style={{ minHeight: 52, fontSize: 16, background: "#fff", borderColor: err ? "var(--color-danger)" : "transparent" }} /></div>
      <span role={err ? "alert" : undefined} style={{ fontSize: 13, color: err ? "var(--color-danger)" : "var(--color-neutral-700)" }}>{err ?? "После пяти ошибок подряд вход закрывается на 15 минут."}</span>
      <button type="submit" className="btn btn-primary" disabled={pending || !email || !password} style={{ justifyContent: "space-between", padding: "15px 22px", fontSize: 16 }}>{pending ? "Входим…" : "Войти"}<span>→</span></button>
    </form>
  );
}
