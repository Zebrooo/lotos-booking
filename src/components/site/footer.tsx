import Link from "next/link";
import type { ClinicInfo } from "@/lib/config";

export function SiteFooter({ clinic }: { clinic: ClinicInfo }) {
  return (
    <footer style={{ borderTop: "1px solid var(--color-divider)", padding: "16px 24px", display: "flex", flexWrap: "wrap", gap: 16, fontSize: 12, color: "var(--color-neutral-700)" }}>
      <span style={{ marginRight: "auto" }}>{clinic.legalName} · {clinic.address} · лицензия {clinic.license}</span>
      <Link href="/dokumenty/politika">Политика обработки данных</Link>
      <Link href="/dokumenty/predoplata">Условия предоплаты</Link>
      <Link href="/dokumenty/pravila">Правила оказания платных услуг</Link>
    </footer>
  );
}
