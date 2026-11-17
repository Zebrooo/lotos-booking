import type { Metadata } from "next";
import { app } from "@/lib/app";
import { crmContext } from "@/lib/crm/context";
import { clinicServices, externalCategories, externalServices, latestImport, type ServiceGroup } from "@/lib/pricing/pricing";
import { CrmHeader } from "@/components/crm/shell";
import { PricingView } from "@/components/crm/pricing-view";

export const metadata: Metadata = { title: "Услуги и цены · CRM Лотос" };

export default async function Prices(props: PageProps<"/crm/tseny">) {
  const { staff, settings } = await crmContext(["admin", "senior"]);
  const { sql } = app();
  const params = await props.searchParams;
  const view = params.view === "external" ? "external" : "clinic";
  const q = typeof params.q === "string" ? params.q.slice(0, 120) : "";
  const kind = params.kind === "analysis" || params.kind === "complex" ? params.kind : "";
  const rawGroup = typeof params.group === "string" ? params.group : "";
  const group: ServiceGroup | undefined = ["doctors", "analysis", "package"].includes(rawGroup) ? rawGroup as ServiceGroup : undefined;
  const status = params.status === "active" || params.status === "inactive" ? params.status : "";
  const source = params.source === "invitro" || params.source === "own" ? params.source : "";
  const category = typeof params.category === "string" ? params.category.slice(0, 200) : "";
  const availableAtHome = params.home === "1";
  const offset = Math.max(Number(params.offset) || 0, 0);
  const [run, services, external, categories] = await Promise.all([
    latestImport(sql),
    view === "clinic" ? clinicServices(sql, { q, group, status, source }) : Promise.resolve([]),
    view === "external" ? externalServices(sql, { q, kind, category, availableAtHome, offset, limit: 50 }) : Promise.resolve({ total: 0, items: [] }),
    view === "external" ? externalCategories(sql, kind) : Promise.resolve([]),
  ]);
  return (
    <>
      <CrmHeader title="Услуги и цены" role={staff.role} paused={settings.onlineBookingPaused} />
      <main style={{ padding: "20px 24px 48px", minWidth: 0 }}>
        <PricingView view={view} q={q} kind={kind} group={group ?? ""} status={status} source={source} category={category}
          availableAtHome={availableAtHome} categories={categories} offset={offset} services={services} external={external}
          run={run ? { status: run.status, totalProducts: run.totalProducts, analysesCount: run.analysesCount, complexesCount: run.complexesCount,
            finishedAt: run.finishedAt?.toISOString() ?? null, error: run.error } : null} />
      </main>
    </>
  );
}
