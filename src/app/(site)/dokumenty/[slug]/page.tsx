// Документы из подвала и из формы записи. Согласия берутся из базы последней
// редакцией; правила и политику готовит юрист клиники — до публикации
// страница прямо говорит, что текста ещё нет.
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { app } from "@/lib/app";
import { getLatestConsent, type ConsentKind } from "@/lib/queries/consents";
import { localDay } from "@/domain/time";
import { Main } from "@/components/site/stepper";

const DOCS: Record<string, { title: string; consent?: ConsentKind }> = {
  predoplata: { title: "Условия предоплаты", consent: "prepay_terms" },
  "soglasie-pd": { title: "Согласие на обработку персональных данных", consent: "personal_data" },
  pravila: { title: "Правила оказания платных медицинских услуг" },
  politika: { title: "Политика обработки персональных данных" },
};
const ru = (iso: string) => `${iso.slice(8, 10)}.${iso.slice(5, 7)}.${iso.slice(0, 4)}`;

export async function generateMetadata(props: PageProps<"/dokumenty/[slug]">): Promise<Metadata> {
  const doc = DOCS[(await props.params).slug];
  return { title: doc ? `${doc.title} · Лотос` : "Документ · Лотос" };
}

export default async function Document(props: PageProps<"/dokumenty/[slug]">) {
  const doc = DOCS[(await props.params).slug];
  if (!doc) notFound();
  const { sql, config } = app();
  const consent = doc.consent ? await getLatestConsent(sql, doc.consent) : null;
  return (
    <Main>
      <article style={{ display: "flex", flexDirection: "column", gap: 20, maxWidth: 760 }}>
        <Link href="/" className="plain-link" style={{ fontSize: 14, color: "var(--color-accent-700)" }}>← Запись к врачу</Link>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <span style={{ fontSize: 12, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--color-neutral-700)" }}>Документы · {config.clinic.legalName}</span>
          <h2 style={{ margin: 0, fontSize: "var(--h2-size)", lineHeight: 1.05, letterSpacing: "-0.025em", textWrap: "balance" }}>{doc.title}</h2>
          {consent && <span style={{ fontSize: 14, color: "var(--color-neutral-700)" }}>Редакция {consent.version} от {ru(localDay(consent.publishedAt))}</span>}
        </div>
        <div style={{ background: "var(--color-surface)", borderRadius: 24, padding: 24, fontSize: 15, lineHeight: 1.6, whiteSpace: "pre-line", textWrap: "pretty" }}>
          {consent ? consent.body : "Текст документа готовит юрист клиники; он будет опубликован до запуска онлайн-записи. Пока его можно получить в регистратуре."}
        </div>
        <span style={{ fontSize: 13, color: "var(--color-neutral-700)" }}>{config.clinic.legalName} · {config.clinic.address} · лицензия {config.clinic.license} · {config.clinic.phone}</span>
      </article>
    </Main>
  );
}
