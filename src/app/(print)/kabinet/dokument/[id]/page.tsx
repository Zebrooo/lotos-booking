// Печатная форма документа из кабинета: заключение, анализы или исследование.
// Доступна только из сессии кабинета владельца; чужой номер документа — 404.
import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { app } from "@/lib/app";
import { currentPhone } from "@/lib/cabinet/session-view";
import { cabinetData } from "@/lib/cabinet/data";
import { cabinetViewModel } from "@/lib/cabinet/view-model";
import { positiveInt } from "@/lib/params";
import { localDay } from "@/domain/time";
import { dateNum, hhmmOf } from "@/lib/format";
import { PrintButton } from "./print-button";

export const metadata: Metadata = { title: "Документ · Лотос", robots: { index: false } };

export default async function PrintDocument(props: PageProps<"/kabinet/dokument/[id]">) {
  const id = positiveInt((await props.params).id);
  const phone = await currentPhone();
  if (!phone) redirect("/kabinet");
  const { sql, adapters, config } = app();
  const data = id ? await cabinetData(sql, adapters.clock, phone) : null;
  if (!data) notFound();
  const now = adapters.clock.now();
  const vm = cabinetViewModel(data, now, { address: config.clinic.address });
  const d = vm.docs.find(x => x.id === id);
  if (!d || d.proc) notFound();
  const c = config.clinic;
  return (
    <main style={{ maxWidth: 760, margin: "0 auto", padding: "32px 24px 48px", display: "flex", flexDirection: "column", gap: 20 }}>
      <header style={{ display: "flex", justifyContent: "space-between", gap: 16, alignItems: "flex-start", paddingBottom: 16, borderBottom: "1px solid var(--color-divider)" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 2, fontSize: 12, color: "var(--color-neutral-800)" }}>
          <span style={{ fontWeight: 800, fontSize: 16, color: "var(--color-text)" }}>{c.legalName}</span>
          <span>{c.address} · {c.phone}</span>
          <span>Лицензия {c.license}</span>
        </div>
        <PrintButton />
      </header>
      <span style={{ fontSize: 12, fontWeight: 700, alignSelf: "flex-start", padding: "5px 12px", borderRadius: 999, background: d.typeBg, color: d.typeFg }}>{d.typeLabel}</span>
      <h1 style={{ margin: 0, fontSize: 28, lineHeight: 1.1, letterSpacing: "-0.02em" }}>{d.title}</h1>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3,minmax(0,1fr))", gap: 8 }}>
        {d.dialog.meta.map(m => (
          <div key={m.k} style={{ border: "1px solid var(--color-divider)", borderRadius: 12, padding: "8px 12px", display: "flex", flexDirection: "column", gap: 2 }}><span style={{ fontSize: 11, color: "var(--color-neutral-700)" }}>{m.k}</span><span style={{ fontWeight: 700, fontSize: 14 }}>{m.v}</span></div>
        ))}
      </div>
      {d.dialog.sections.map(x => (
        <div key={x.k} style={{ display: "flex", flexDirection: "column", gap: 4 }}><span style={{ fontSize: 12, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--color-neutral-700)" }}>{x.k}</span><span style={{ fontSize: 15 }}>{x.v}</span></div>
      ))}
      {d.dialog.recs.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <span style={{ fontSize: 12, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--color-neutral-700)" }}>Рекомендации</span>
          <ol style={{ margin: 0, paddingLeft: 20, display: "flex", flexDirection: "column", gap: 4, fontSize: 15 }}>{d.dialog.recs.map((r, i) => <li key={i}>{r}</li>)}</ol>
        </div>
      )}
      {d.dialog.rows.length > 0 && (
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
          <thead><tr style={{ textAlign: "left", fontSize: 11, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--color-neutral-700)" }}><th style={{ padding: "8px 0" }}>Показатель</th><th>Результат</th><th>Ед.</th><th>Норма</th></tr></thead>
          <tbody>
            {d.dialog.rows.map(r => (
              <tr key={r.name} style={{ borderTop: "1px solid var(--color-divider)" }}>
                <td style={{ padding: "8px 0", fontWeight: 600 }}>{r.name}</td>
                <td style={{ fontWeight: 800, color: r.bad ? "var(--color-danger)" : "var(--color-text)" }}>{r.val}{r.bad ? " ↑" : ""}</td>
                <td style={{ color: "var(--color-neutral-700)" }}>{r.unit}</td>
                <td style={{ color: "var(--color-neutral-700)" }}>{r.ref}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <footer style={{ marginTop: 12, paddingTop: 12, borderTop: "1px solid var(--color-divider)", fontSize: 12, color: "var(--color-neutral-700)" }}>
        Копия из личного кабинета, сформирована {dateNum(localDay(now))} {localDay(now).slice(0, 4)} в {hhmmOf(now)}. Оригинал с печатью — в регистратуре.
      </footer>
    </main>
  );
}
