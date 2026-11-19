import type { Metadata } from "next";
import { app } from "@/lib/app";
import { publicLabCategories, publicLabGroups, publicLabServices, selectedLabServices } from "@/lib/pricing/public";
import { LAB_GROUPS, labGroup } from "@/lib/pricing/lab-groups";
import { parseLabServiceIds } from "@/lib/lab-pool";
import { Main } from "@/components/site/stepper";
import { LabCatalog } from "@/components/booking/lab-catalog";

export const metadata: Metadata = { title: "Анализы и пакеты · Лотос" };

export default async function LabPage(props: PageProps<"/analizy">) {
  const { sql } = app();
  const params = await props.searchParams;
  const q = typeof params.q === "string" ? params.q.slice(0, 120) : "";
  const kind = params.kind === "analysis" || params.kind === "complex" ? params.kind : "";
  const group = labGroup(params.group)?.id ?? "";
  const category = typeof params.category === "string" ? params.category.slice(0, 200) : "";
  const availableAtHome = params.home === "1";
  const offset = Math.max(Number(params.offset) || 0, 0);
  const serviceIds = parseLabServiceIds(params.services);
  const [catalog, categories, selected, groupData] = await Promise.all([
    publicLabServices(sql, { q, kind, group, category, availableAtHome, offset, limit: 24 }),
    publicLabCategories(sql, kind, group),
    selectedLabServices(sql, serviceIds),
    publicLabGroups(sql, kind),
  ]);
  const groups = LAB_GROUPS.map(item => ({ ...item, count: groupData.counts[item.id] ?? 0 }));
  return (
    <Main>
      <LabCatalog key={`${q}:${kind}:${group}:${category}:${availableAtHome}:${offset}:${serviceIds.join(",")}`}
        q={q} kind={kind} group={group} category={category} categories={categories} availableAtHome={availableAtHome}
        groups={groups} allCount={groupData.total} offset={offset} total={catalog.total} items={catalog.items} selected={selected.filter(item => item.bookable)} />
    </Main>
  );
}
