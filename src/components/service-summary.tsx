import { formatRub } from "@/lib/texts";
import type { CatalogService } from "@/lib/queries/catalog";
import { ui } from "./ui";

/** Шапка услуги: название, длительность, цена, предоплата и памятка о подготовке. */
export function ServiceSummary({ service }: { service: Pick<CatalogService, "title" | "durationMin" | "priceKopecks" | "prepayKopecks" | "prepNote"> }) {
  return (
    <div className="space-y-3">
      <h1 className={ui.h1}>{service.title}</h1>
      <p className="text-slate-600">
        {service.durationMin} мин · {formatRub(service.priceKopecks)} · предоплата при записи {formatRub(service.prepayKopecks)}
      </p>
      {service.prepNote && (
        <p className="rounded-xl border border-sky-200 bg-sky-50 p-3 text-sm text-sky-900">
          <span className="font-semibold">Подготовка. </span>{service.prepNote}
        </p>
      )}
    </div>
  );
}
