"use client";
// Шапка сайта — разметка из прототипа «Запись (клиент)». Активный пункт
// навигации подсвечивается цветом акцента по разделу.
import Link from "next/link";
import { usePathname } from "next/navigation";

const tx = "var(--color-text)";
const acc = "var(--color-accent)";

export function SiteHeader({ phone, initial }: { phone: string; initial: string | null }) {
  const path = usePathname();
  const inCab = path.startsWith("/kabinet") || path.startsWith("/moya-zapis");
  return (
    <header style={{ display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap", padding: "14px 24px", borderBottom: "1px solid var(--color-divider)" }}>
      <Link href="/" className="plain-link" style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer", marginRight: "auto" }}>
        <div style={{ width: 22, height: 22, background: "var(--color-accent)", borderRadius: "60% 0 60% 0", transform: "rotate(-45deg)" }} />
        <div style={{ display: "flex", flexDirection: "column", lineHeight: 1.05 }}>
          <span style={{ fontWeight: 800, fontSize: 19, letterSpacing: "-0.02em" }}>ЛОТОС</span>
          <span style={{ fontSize: 11, color: "var(--color-neutral-700)" }}>медицинский центр</span>
        </div>
      </Link>
      <nav style={{ display: "flex", gap: "8px 18px", alignItems: "center", fontSize: 14, flexWrap: "wrap" }}>
        <Link href="/" className="plain-link" style={{ cursor: "pointer", fontWeight: 600, color: inCab ? tx : acc }}>Запись к врачу</Link>
        <Link href="/kabinet" className="plain-link" style={{ cursor: "pointer", fontWeight: 600, display: "flex", alignItems: "center", gap: 8, color: inCab ? acc : tx }}>
          <span style={{ width: 30, height: 30, borderRadius: "50%", background: "var(--color-accent-100)", color: "var(--color-accent)", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: 13 }}>
            {initial ?? (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
                <circle cx="12" cy="8" r="4" />
                <path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6" />
              </svg>
            )}
          </span>
          Личный кабинет
        </Link>
        <a href={`tel:${phone.replace(/[^\d+]/g, "")}`} style={{ fontWeight: 700, textDecoration: "none", color: "var(--color-text)" }}>{phone}</a>
      </nav>
    </header>
  );
}
