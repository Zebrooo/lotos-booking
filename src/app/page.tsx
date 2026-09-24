import Link from "next/link";
import { app } from "@/lib/app";
import { listCatalog } from "@/lib/queries/catalog";
import { loadSettings } from "@/lib/usecases/settings";
import { formatRub } from "@/lib/texts";
import { ui, KIND_LABEL, first } from "@/components/ui";

export default async function Home(props: PageProps<"/">) {
  const q = (first((await props.searchParams).q) ?? "").slice(0, 100);
  const { sql } = app();
  const [catalog, settings] = await Promise.all([listCatalog(sql, q), loadSettings(sql)]);
  const groups = Object.entries(KIND_LABEL)
    .map(([kind, label]) => ({ kind, label, services: catalog.services.filter(s => s.kind === kind) }))
    .filter(g => g.services.length > 0);

  return (
    <div className="space-y-8">
      <section className="space-y-4">
        <h1 className={ui.h1}>Запись к врачу</h1>
        <p className="text-slate-600">Найдите врача по фамилии или специальности, выберите удобное время и оплатите предоплату. Запись подтверждается сразу после оплаты.</p>
        <form role="search" className="flex gap-2">
          <label htmlFor="q" className="sr-only">Поиск</label>
          <input id="q" name="q" defaultValue={q} placeholder="Например: кардиолог, Орлова, УЗИ" className={`${ui.input} mt-0`} />
          <button className={`${ui.btn} ${ui.primary}`}>Найти</button>
        </form>
        {settings.onlineBookingPaused && (
          <p role="status" className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
            Онлайн-запись временно приостановлена. Записаться можно по телефону клиники.
          </p>
        )}
      </section>

      {q && catalog.services.length === 0 && (
        <p className={ui.card}>
          По запросу «{q}» ничего не нашлось. <Link className={ui.link} href="/">Показать все услуги</Link>
        </p>
      )}

      {catalog.doctors.length > 0 && q && (
        <section className="space-y-3">
          <h2 className={ui.h2}>Врачи</h2>
          <ul className="grid gap-3 sm:grid-cols-2">
            {catalog.doctors.map(d => (
              <li key={d.id} className={ui.card}>
                <div className="font-medium">{d.title}</div>
                <div className={ui.muted}>{d.specialty}</div>
                <ul className="mt-3 space-y-1 text-sm">
                  {d.services.map(s => (
                    <li key={s.id}><Link className={ui.link} href={`/zapis/${s.id}?doctor=${d.id}`}>{s.title}</Link></li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        </section>
      )}

      {groups.map(g => (
        <section key={g.kind} className="space-y-3">
          <h2 className={ui.h2}>{g.label}</h2>
          <ul className="grid gap-3">
            {g.services.map(s => (
              <li key={s.id}>
                <Link href={`/zapis/${s.id}`} className={`${ui.card} flex items-center justify-between gap-4 transition hover:border-teal-600`}>
                  <span>
                    <span className="block font-medium">{s.title}</span>
                    <span className={ui.muted}>
                      {s.durationMin} мин · {s.doctors.map(d => d.title.split(" ")[0]).join(", ")}
                    </span>
                  </span>
                  <span className="shrink-0 text-right">
                    <span className="block font-semibold">{formatRub(s.priceKopecks)}</span>
                    <span className="text-xs text-slate-500">предоплата {formatRub(s.prepayKopecks)}</span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
