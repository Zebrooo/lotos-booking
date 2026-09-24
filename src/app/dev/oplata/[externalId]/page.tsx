import { notFound } from "next/navigation";
import { app } from "@/lib/app";
import { formatRub } from "@/lib/texts";
import { ui } from "@/components/ui";
import { fakePayAction } from "./actions";

// Тестовая страница оплаты для заглушки платежей. В бою её место займёт
// страница банка; в production маршрут отвечает 404.
export default async function FakePayment(props: PageProps<"/dev/oplata/[externalId]">) {
  const { externalId } = await props.params;
  const { sql, adapters } = app();
  if (adapters.payment.name !== "fake" || process.env.NODE_ENV === "production") notFound();
  const [p] = await sql<{ amountKopecks: number; status: string; title: string }[]>`select p.amount_kopecks, p.status, b.service->>'title' as title
    from payments p join bookings b on b.id = p.booking_id where p.provider = 'fake' and p.external_id = ${externalId}`;
  if (!p) notFound();
  return (
    <div className="mx-auto max-w-md space-y-5">
      <p className="rounded-xl border border-dashed border-slate-400 bg-slate-100 p-3 text-sm text-slate-700">
        Тестовая оплата. Настоящий банк не подключён, деньги не списываются.
      </p>
      <div className={`${ui.card} space-y-4 text-center`}>
        <p className={ui.muted}>Предоплата · {p.title}</p>
        <p className="text-4xl font-semibold">{formatRub(p.amountKopecks)}</p>
        {p.status === "created" ? (
          <div className="flex justify-center gap-3">
            <form action={fakePayAction.bind(null, externalId, "paid")}><button className={`${ui.btn} ${ui.primary}`}>Оплатить</button></form>
            <form action={fakePayAction.bind(null, externalId, "failed")}><button className={`${ui.btn} ${ui.secondary}`}>Отказаться</button></form>
          </div>
        ) : (
          <p>Платёж уже обработан: {p.status}.</p>
        )}
      </div>
    </div>
  );
}
