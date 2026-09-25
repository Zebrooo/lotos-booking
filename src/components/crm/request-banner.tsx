// Плашка «Запрос врача» над страницами администратора — как в прототипе.
import Link from "next/link";

export function RequestBanner({ request }: { request: { resourceId: number; day: string; reason: string; text: string } | null }) {
  if (!request) return null;
  const href = `/crm/raspisanie?den=${request.day}&snyat=${request.resourceId}&prichina=${encodeURIComponent(request.reason)}`;
  return (
    <div className="no-print" style={{ border: "1px solid var(--color-neutral-300)", padding: "12px 16px", display: "flex", gap: 16, alignItems: "center", flexWrap: "wrap", borderRadius: 14 }}>
      <span style={{ fontWeight: 800 }}>Запрос врача</span>
      <span style={{ flex: 1, minWidth: 240 }}>{request.text}</span>
      <Link href={href} className="btn btn-primary" style={{ padding: "8px 14px" }}>Разобрать →</Link>
    </div>
  );
}
