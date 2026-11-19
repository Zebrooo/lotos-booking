// Степпер записи: выбор услуги, время, данные, оплата и подтверждение.
const STEPS = ["Врач", "Время", "Данные", "Оплата", "Готово"];

export function Stepper({ step, firstLabel = "Врач" }: { step: 1 | 2 | 3 | 4; firstLabel?: string }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(5,minmax(0,1fr))", gap: 4, padding: 4, margin: "12px 24px 0", borderRadius: 999, background: "var(--color-surface)" }}>
      {STEPS.map((label, i) => {
        const bg = i === step ? "var(--color-text)" : i < step ? "var(--color-neutral-200)" : "transparent";
        const fg = i === step ? "var(--color-bg)" : i < step ? "var(--color-text)" : "var(--color-neutral-600)";
        const text = i === 0 ? firstLabel : label;
        return (
          <div key={label} style={{ padding: "9px 14px", display: "flex", gap: 8, alignItems: "baseline", justifyContent: "center", borderRadius: 999, background: bg, color: fg }}>
            <span style={{ fontWeight: 800, fontSize: 13 }}>{String(i + 1).padStart(2, "0")}</span>
            <span className="step-label" style={{ fontSize: 13 }}>{text}</span>
          </div>
        );
      })}
    </div>
  );
}

/** Основная область страницы — отступы как в прототипе. */
export function Main({ children }: { children: React.ReactNode }) {
  return <main style={{ flex: 1, padding: "32px 24px 56px" }}>{children}</main>;
}
