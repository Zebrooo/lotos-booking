import type { Metadata } from "next";
import { app } from "@/lib/app";
import { crmContext } from "@/lib/crm/context";
import { clinicServices, externalServices, latestImport } from "@/lib/pricing/pricing";
import { CrmHeader } from "@/components/crm/shell";
import { PricingView } from "@/components/crm/pricing-view";

export const metadata: Metadata = { title: "Цены · CRM Лотос" };

export default async function Prices(props: PageProps<"/crm/tseny">) {
  const { staff, settings } = await crmContext(["admin", "senior"]);
  const { sql } = app();
  const params = await props.searchParams;
  const view = params.view === "external" ? "external" : "clinic";
  const q = typeof params.q === "string" ? params.q.slice(0, 120) : "";
  const kind = params.kind === "analysis" || params.kind === "complex" ? params.kind : "";
  const offset = Math.max(Number(params.offset) || 0, 0);
  const [run, services, external] = await Promise.all([
    latestImport(sql),
    view === "clinic" ? clinicServices(sql, q) : Promise.resolve([]),
    view === "external" ? externalServices(sql, { q, kind, offset, limit: 50 }) : Promise.resolve({ total: 0, items: [] }),
  ]);
  return (
    <>
      <CrmHeader title="Цены и каталог" role={staff.role} paused={settings.onlineBookingPaused} />
      <main style={{ padding: "20px 24px 48px", minWidth: 0 }}>
        <PricingView view={view} q={q} kind={kind} offset={offset} services={services} external={external}
          run={run ? { status: run.status, totalProducts: run.totalProducts, analysesCount: run.analysesCount, complexesCount: run.complexesCount,
            finishedAt: run.finishedAt?.toISOString() ?? null, error: run.error } : null} />
      </main>
    </>
  );
}
