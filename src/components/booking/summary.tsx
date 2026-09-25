// Боковая сводка «Ваша запись» — одинаковая на шагах «Время» и «Данные».
export type SummaryRow = { k: string; v: string };

export function SummaryRows({ rows }: { rows: SummaryRow[] }) {
  return (
    <div style={{ display: "flex", flexDirection: "column" }}>
      {rows.map(r => (
        <div key={r.k} style={{ display: "flex", justifyContent: "space-between", gap: 12, padding: "8px 0", borderBottom: "1px solid var(--color-divider)", fontSize: 14 }}>
          <span style={{ color: "var(--color-neutral-700)" }}>{r.k}</span><span style={{ fontWeight: 600, textAlign: "right" }}>{r.v}</span>
        </div>
      ))}
    </div>
  );
}

export const asideStyle: React.CSSProperties = {
  flex: "1 1 300px", maxWidth: 420, position: "sticky", top: 16, background: "var(--color-surface)", padding: 24,
  borderRadius: 28, display: "flex", flexDirection: "column", gap: 14,
};

export const kicker: React.CSSProperties = { fontSize: 12, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--color-neutral-700)" };
