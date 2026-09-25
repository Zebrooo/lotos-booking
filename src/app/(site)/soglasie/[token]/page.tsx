// Согласие пациента, которого записал родственник или знакомый («Другой
// взрослый»). Страницы нет в макете; сделана в его языке — как «Моя запись».
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { app } from "@/lib/app";
import { token as tokenParam } from "@/lib/params";
import { consentView } from "@/lib/usecases/patient-consent";
import { Main } from "@/components/site/stepper";
import { ConsentForm } from "./consent-form";

export const metadata: Metadata = { title: "Согласие пациента · Лотос", robots: { index: false } };

const kicker: React.CSSProperties = { fontSize: 12, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--color-neutral-700)" };
const ru = (iso: string) => `${iso.slice(8, 10)}.${iso.slice(5, 7)}.${iso.slice(0, 4)}`;

export default async function PatientConsent(props: PageProps<"/soglasie/[token]">) {
  const t = tokenParam((await props.params).token);
  const { sql, adapters, config } = app();
  const v = t ? await consentView(sql, adapters.clock, t) : null;
  if (!t || !v) notFound();
  const rows = [
    { k: "Пациент", v: v.patient },
    { k: "Когда", v: v.when },
    { k: "Врач", v: `${v.doctor}${v.specialty ? `, ${v.specialty.toLowerCase()}` : ""}` },
    { k: "Услуга", v: v.service },
    { k: "Адрес", v: `${config.clinic.address} · ${config.clinic.addressNote}` },
    ...(v.recorderPhone ? [{ k: "Записал", v: `владелец номера ${v.recorderPhone}` }] : []),
  ];
  const title = v.state === "given" ? "Согласие получено" : v.state === "closed" ? "Запись не действует" : "Вас записали на приём";
  return (
    <Main>
      <section style={{ display: "flex", flexDirection: "column", gap: 24, maxWidth: 760 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <span style={kicker}>Согласие пациента</span>
          <h2 style={{ margin: 0, fontSize: "var(--h2-size)", letterSpacing: "-0.025em" }}>{title}</h2>
          <span style={{ fontSize: 16, color: "var(--color-neutral-800)", textWrap: "pretty" }}>
            {v.state === "given" ? "Спасибо. Запись в силе — ждём вас в клинике. Напоминание придёт тому, кто вас записал."
              : v.state === "closed" ? "Запись отменена или уже прошла. Записаться заново можно на сайте или по телефону клиники."
              : "Вас записал родственник или знакомый. Чтобы запись подтвердилась, проверьте данные и дайте согласие на обработку персональных данных."}
          </span>
        </div>
        <div style={{ display: "flex", flexDirection: "column" }}>
          {rows.map(r => (
            <div key={r.k} style={{ display: "grid", gridTemplateColumns: "140px minmax(0,1fr)", gap: 12, padding: "10px 0", borderBottom: "1px solid var(--color-divider)", fontSize: 14 }}>
              <span style={{ color: "var(--color-neutral-700)" }}>{r.k}</span><span style={{ fontWeight: 600 }}>{r.v}</span>
            </div>
          ))}
        </div>
        {v.state === "pending" && <>
          <div style={{ background: "var(--color-surface)", borderRadius: 24, padding: 20, display: "flex", flexDirection: "column", gap: 8 }}>
            <span style={{ fontWeight: 800, fontSize: 16 }}>{v.consent.title}</span>
            <span style={{ fontSize: 12, color: "var(--color-neutral-700)" }}>Редакция {v.consent.version} от {ru(v.consent.publishedOn)}</span>
            <div style={{ maxHeight: 260, overflow: "auto", fontSize: 14, lineHeight: 1.55, whiteSpace: "pre-line", paddingRight: 8 }}>{v.consent.body}</div>
          </div>
          <ConsentForm token={t} version={ru(v.consent.publishedOn)} />
          <span style={{ fontSize: 13, color: "var(--color-neutral-700)", textWrap: "pretty" }}>Если вы не записывались и не знаете, кто это сделал, позвоните в клинику: {config.clinic.phone}.</span>
        </>}
      </section>
    </Main>
  );
}
