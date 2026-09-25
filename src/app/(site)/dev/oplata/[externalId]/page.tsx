import { notFound } from "next/navigation";
import { app } from "@/lib/app";
import { appConfig } from "@/lib/config";
import { rub } from "@/lib/format";
import { Stepper, Main } from "@/components/site/stepper";
import { fakePayAction } from "./actions";

// Имитация страницы банка-эквайера — как в прототипе. Только при заглушке
// платежей и вне production; в бою сюда ведёт ссылка настоящего банка.
export default async function FakeBank(props: PageProps<"/dev/oplata/[externalId]">) {
  const { externalId } = await props.params;
  const { sql, adapters } = app();
  if (adapters.payment.name !== "fake" || process.env.NODE_ENV === "production") notFound();
  const [p] = await sql<{ amountKopecks: number; status: string }[]>`select amount_kopecks, status from payments where provider = 'fake' and external_id = ${externalId}`;
  if (!p) notFound();
  const { clinic } = appConfig(process.env, { strict: false });
  return (
    <>
      <Stepper step={3} />
      <Main>
        <section style={{ maxWidth: 560, display: "flex", flexDirection: "column", gap: 24 }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <span style={{ fontSize: 12, color: "var(--color-neutral-700)" }}>Страница банка-эквайера · имитация</span>
            <div style={{ border: "1px solid var(--color-neutral-300)", padding: 24, display: "flex", flexDirection: "column", gap: 16, background: "var(--color-bg)", borderRadius: 24 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}><span style={{ fontWeight: 800 }}>Оплата услуг · {clinic.legalName}</span><span style={{ fontWeight: 800, fontSize: 28 }}>{rub(p.amountKopecks)}</span></div>
              <div className="field"><label>Номер карты</label><input className="input" value="2200 0000 0000 4417" readOnly style={{ minHeight: 44 }} /></div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <div className="field"><label>Срок</label><input className="input" value="09/29" readOnly style={{ minHeight: 44 }} /></div>
                <div className="field"><label>CVC</label><input className="input" value="•••" readOnly style={{ minHeight: 44 }} /></div>
              </div>
              <span style={{ fontSize: 12, color: "var(--color-neutral-700)" }}>Кассовый чек на предоплату придёт в СМС и на почту, если укажете её.</span>
              {p.status === "created" ? (
                <form action={fakePayAction.bind(null, externalId)} style={{ display: "flex", flexDirection: "column" }}>
                  <button className="btn btn-primary" style={{ padding: "14px 16px", fontSize: 15, justifyContent: "space-between" }}>Оплатить {rub(p.amountKopecks)}<span>→</span></button>
                </form>
              ) : <span style={{ fontWeight: 700 }}>Платёж уже обработан.</span>}
            </div>
          </div>
        </section>
      </Main>
    </>
  );
}
