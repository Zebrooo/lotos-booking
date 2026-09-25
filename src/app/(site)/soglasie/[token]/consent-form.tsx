"use client";
// Галочка согласия и кнопка — как пункты согласий на форме записи.
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { giveConsentAction } from "./actions";

export function ConsentForm({ token, version }: { token: string; version: string }) {
  const [on, setOn] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <label style={{ display: "grid", gridTemplateColumns: "26px minmax(0,1fr)", gap: 12, alignItems: "start", fontSize: 14, cursor: "pointer" }}>
        <input type="checkbox" checked={on} onChange={e => { setOn(e.target.checked); setErr(null); }} style={{ position: "absolute", opacity: 0, width: 1, height: 1 }} />
        <span aria-hidden style={{ width: 26, height: 26, borderRadius: 8, border: `2px solid ${err ? "var(--color-danger)" : on ? "var(--color-accent)" : "var(--color-neutral-300)"}`, background: on ? "var(--color-accent)" : "#fff", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 800 }}>{on ? "✓" : ""}</span>
        <span>Даю согласие на обработку моих персональных данных (отдельный документ, ред. от {version})</span>
      </label>
      {err && <span role="alert" style={{ fontSize: 13, color: "var(--color-danger)" }}>{err}</span>}
      <button className="btn btn-primary" disabled={pending} style={{ alignSelf: "flex-start", padding: "14px 22px", fontSize: 15 }}
        onClick={() => start(async () => {
          const r = await giveConsentAction(token, on);
          if (r.ok) router.refresh(); else setErr(r.error);
        })}>{pending ? "Сохраняем…" : "Подтвердить запись →"}</button>
    </div>
  );
}
