import type { Metadata } from "next";
import { app } from "@/lib/app";
import { publicLabCategories, publicLabServices } from "@/lib/pricing/public";
import { Main } from "@/components/site/stepper";
import { LabCatalog } from "@/components/booking/lab-catalog";

export const metadata: Metadata = { title: "Анализы и пакеты · Лотос" };

export default async function LabPage(props: PageProps<"/analizy">) {
  const { sql } = app();
  const params = await props.searchParams;
  const q = typeof params.q === "string" ? params.q.slice(0, 120) : "";
  const kind = params.kind === "analysis" || params.kind === "complex" ? params.kind : "";
  const category = typeof params.category === "string" ? params.category.slice(0, 200) : "";
  const availableAtHome = params.home === "1";
  const offset = Math.max(Number(params.offset) || 0, 0);
  const [catalog, categories] = await Promise.all([
    publicLabServices(sql, { q, kind, category, availableAtHome, offset, limit: 24 }),
    publicLabCategories(sql, kind),
  ]);
  return (
    <Main>
      <LabCatalog q={q} kind={kind} category={category} categories={categories} availableAtHome={availableAtHome}
        offset={offset} total={catalog.total} items={catalog.items} />
    </Main>
  );
}
