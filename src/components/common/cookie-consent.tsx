"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { saveCookieChoice } from "@/lib/cookies/actions";
import type { CookieChoice } from "@/lib/cookies/consent";

const EVENT_NAME = "lotos:cookie-settings";
const surface: React.CSSProperties = {
  position: "fixed", zIndex: 100, left: 16, right: 16, bottom: 16, maxWidth: 980, margin: "0 auto",
  background: "var(--color-surface)", color: "var(--color-text)", border: "1px solid var(--color-divider)",
  borderRadius: 24, padding: 20, boxShadow: "0 16px 48px rgba(0,0,0,.18)", display: "flex", flexDirection: "column", gap: 14,
};

export function CookieConsent({ initialChoice }: { initialChoice: CookieChoice | null }) {
  const router = useRouter();
  const [visible, setVisible] = useState(initialChoice === null);
  const [settings, setSettings] = useState(false);
  const [analytics, setAnalytics] = useState(initialChoice?.analytics ?? false);
  const [pending, start] = useTransition();
  useEffect(() => {
    const open = () => { setSettings(true); setVisible(true); };
    window.addEventListener(EVENT_NAME, open);
    return () => window.removeEventListener(EVENT_NAME, open);
  }, []);
  if (!visible) return null;

  const save = (allow: boolean) => start(async () => {
    await saveCookieChoice(allow);
    setVisible(false);
    router.refresh();
  });

  return (
    <section aria-label="Настройки cookies" style={surface}>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <b style={{ fontSize: 18 }}>Мы используем куки</b>
        <span style={{ fontSize: 14, lineHeight: 1.5, textWrap: "pretty" }}>
          Необходимые cookies обеспечивают вход, безопасность и работу формы записи. Необязательную аналитику можно принять или отклонить отдельно.
          {" "}<Link className="plain-link" href="/dokumenty/cookie" style={{ textDecoration: "underline" }}>Подробнее в политике cookie</Link>.
        </span>
      </div>
      {settings && (
        <div style={{ display: "flex", flexDirection: "column", gap: 10, borderTop: "1px solid var(--color-divider)", paddingTop: 12 }}>
          <label style={{ display: "flex", gap: 10, alignItems: "flex-start", fontSize: 14 }}>
            <input type="checkbox" checked disabled aria-label="Необходимые cookies" />
            <span><b>Необходимые</b><br /><span style={{ color: "var(--color-neutral-700)" }}>Сессии, защита формы и сохранение вашего выбора. Без них сайт не работает.</span></span>
          </label>
          <label style={{ display: "flex", gap: 10, alignItems: "flex-start", fontSize: 14 }}>
            <input type="checkbox" checked={analytics} onChange={event => setAnalytics(event.target.checked)} aria-label="Аналитические cookies" />
            <span><b>Аналитические</b><br /><span style={{ color: "var(--color-neutral-700)" }}>Помогают понимать использование сайта. Сейчас внешняя аналитика не подключена и при отказе не включается.</span></span>
          </label>
        </div>
      )}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {settings ? (
          <>
            <button className="btn btn-primary" disabled={pending} onClick={() => save(analytics)}>Сохранить выбор</button>
            <button className="btn btn-secondary" disabled={pending} onClick={() => setSettings(false)}>Назад</button>
          </>
        ) : (
          <>
            <button className="btn btn-primary" disabled={pending} onClick={() => save(true)}>Принять все</button>
            <button className="btn btn-secondary" disabled={pending} onClick={() => save(false)}>Только необходимые</button>
            <button className="btn btn-secondary" disabled={pending} onClick={() => setSettings(true)}>Настроить</button>
          </>
        )}
      </div>
    </section>
  );
}

export function CookieSettingsButton() {
  return <button className="btn btn-secondary" onClick={() => window.dispatchEvent(new Event(EVENT_NAME))}>Изменить настройки cookies</button>;
}
