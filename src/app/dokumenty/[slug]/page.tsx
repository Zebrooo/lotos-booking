import { notFound } from "next/navigation";
import { app } from "@/lib/app";
import { getLatestConsent, type ConsentKind } from "@/lib/queries/consents";
import { ui } from "@/components/ui";

// Документы для пациента. Согласия берутся из базы последней редакцией,
// оферту и политику готовит юрист клиники: до этого страница честно
// говорит, что текста ещё нет.
const DOCS: Record<string, { title: string; consent?: ConsentKind }> = {
  predoplata: { title: "Условия предоплаты", consent: "prepay_terms" },
  "soglasie-pd": { title: "Согласие на обработку персональных данных", consent: "personal_data" },
  oferta: { title: "Договор-оферта на оказание платных медицинских услуг" },
  politika: { title: "Политика обработки персональных данных" },
};

export default async function Document(props: PageProps<"/dokumenty/[slug]">) {
  const doc = DOCS[(await props.params).slug];
  if (!doc) notFound();
  const consent = doc.consent ? await getLatestConsent(app().sql, doc.consent) : null;
  return (
    <article className="space-y-4">
      <h1 className={ui.h1}>{doc.title}</h1>
      {consent ? (
        <>
          <p className={ui.muted}>Редакция {consent.version} от {consent.publishedAt.toLocaleDateString("ru-RU", { timeZone: "Asia/Yekaterinburg" })}</p>
          <div className={`${ui.card} whitespace-pre-line leading-relaxed`}>{consent.body}</div>
        </>
      ) : (
        <p className={ui.card}>Текст документа готовит юрист клиники и будет опубликован до запуска онлайн-записи.</p>
      )}
    </article>
  );
}
