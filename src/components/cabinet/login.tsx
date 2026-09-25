"use client";
// Вход в кабинет по номеру телефона и коду из СМС — экран прототипа «Личный кабинет».
import { useRef, useState, useTransition } from "react";
import { maskPhone } from "@/lib/forms/booking-v2";
import { requestLoginCodeAction, loginAction } from "@/app/(site)/kabinet/actions";

const kicker: React.CSSProperties = { fontSize: 12, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--color-neutral-700)" };

export function CabinetLogin() {
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [stage, setStage] = useState<"phone" | "code">("phone");
  const [err, setErr] = useState("");
  const [pending, start] = useTransition();
  const phoneRef = useRef<HTMLInputElement>(null);
  // Назад к номеру: код сбрасывается, поле телефона — в фокусе.
  const changePhone = () => { setStage("phone"); setCode(""); setErr(""); requestAnimationFrame(() => phoneRef.current?.focus()); };

  const next = () => {
    if (pending) return;
    if (stage === "phone") {
      if (phone.replace(/\D/g, "").length < 11) { setErr("Введите номер полностью: +7 и 10 цифр"); return; }
      start(async () => {
        const r = await requestLoginCodeAction(phone);
        if (r.ok) { setStage("code"); setErr(""); } else setErr(r.error ?? "Не удалось отправить код");
      });
      return;
    }
    if (code.length < 4) { setErr("Введите код из СМС — 4 цифры"); return; }
    start(async () => {
      const r = await loginAction(phone, code);
      if (r?.error) setErr(r.error);
    });
  };

  const hint = err || (stage === "code" ? `Отправили код на ${phone}. Не пришёл — проверьте номер: нужен тот, что вы оставляли при записи.` : "Код придёт в СМС в течение минуты");
  return (
    <form onSubmit={e => { e.preventDefault(); next(); }} style={{ width: "100%", maxWidth: 460, margin: "8px auto 0", background: "var(--color-surface)", borderRadius: 32, padding: 32, display: "flex", flexDirection: "column", gap: 16, boxSizing: "border-box" }}>
      <span style={kicker}>Личный кабинет</span>
      <h2 style={{ margin: 0, fontSize: 32, lineHeight: 1.05, letterSpacing: "-0.025em" }}>Вход по номеру телефона</h2>
      <p style={{ margin: 0, fontSize: 15, color: "var(--color-neutral-800)", textWrap: "pretty" }}>Укажите номер, который оставляли при записи. Пароль не нужен — пришлём код в СМС.</p>
      <div className="field">
        <label htmlFor="cab-phone">Телефон</label>
        <input id="cab-phone" ref={phoneRef} className="input" type="tel" inputMode="numeric" autoComplete="tel" value={phone} placeholder="+7 900 000-00-00"
          onChange={e => { setPhone(maskPhone(e.target.value)); setErr(""); if (stage === "code") { setStage("phone"); setCode(""); } }}
          style={{ minHeight: 52, fontSize: 18, background: "#fff", borderColor: err && stage === "phone" ? "var(--color-danger)" : "transparent" }} />
      </div>
      {stage === "code" && (
        <div className="field">
          <label htmlFor="cab-code">Код из СМС</label>
          <input id="cab-code" className="input" inputMode="numeric" autoComplete="one-time-code" autoFocus value={code} placeholder="••••"
            onChange={e => { setCode(e.target.value.replace(/\D/g, "").slice(0, 4)); setErr(""); }}
            style={{ minHeight: 56, maxWidth: 200, fontSize: 26, fontWeight: 800, letterSpacing: "0.3em", background: "#fff", borderColor: err ? "var(--color-danger)" : "transparent" }} />
        </div>
      )}
      <span role={err ? "alert" : undefined} style={{ fontSize: 13, color: err ? "var(--color-danger)" : "var(--color-neutral-700)" }}>{hint}</span>
      <button type="submit" className="btn btn-primary" disabled={pending} style={{ justifyContent: "space-between", padding: "15px 22px", fontSize: 16 }}>
        {stage === "code" ? "Войти" : "Получить код"}<span>→</span>
      </button>
      {stage === "code" && (
        <button type="button" className="btn btn-secondary" onClick={changePhone} style={{ padding: "13px 22px", fontSize: 15, background: "#fff" }}>Изменить номер</button>
      )}
    </form>
  );
}
