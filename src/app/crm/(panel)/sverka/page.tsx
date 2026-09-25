// Сверка оплат: поступления из банка ↔ записи, ждущие оплаты.
import type { Metadata } from "next";
import { app } from "@/lib/app";
import { crmContext } from "@/lib/crm/context";
import { reconData } from "@/lib/crm/data";
import { bookingVM, tstamp } from "@/lib/crm/view";
import { rub } from "@/lib/format";
import { first, positiveInt } from "@/lib/params";
import { CrmHeader } from "@/components/crm/shell";
import { ReconView } from "@/components/crm/views";
import { RequestBanner } from "@/components/crm/request-banner";

export const metadata: Metadata = { title: "Сверка оплат · CRM Лотос" };

export default async function Recon(props: PageProps<"/crm/sverka">) {
  const { staff, settings, now, request } = await crmContext(["admin", "senior"]);
  const { sql, adapters } = app();
  const r = await reconData(sql, adapters.clock);
  const pre = positiveInt(first((await props.searchParams).zapis));
  const waiting = r.waiting.map(b => bookingVM(b, now));
  const prepays = [...new Set(r.waiting.map(b => b.prepayKopecks))];
  const same = prepays.length <= 1 ? `Все предоплаты одинаковые — ${rub(prepays[0] ?? 40000)}. ` : "";
  return (
    <>
      <CrmHeader title="Сверка оплат" role={staff.role} paused={settings.onlineBookingPaused} />
      <main style={{ padding: "20px 24px 48px", display: "flex", flexDirection: "column", gap: 16, minWidth: 0 }}>
        <RequestBanner request={request} />
        <ReconView note={`${same}Сопоставляйте по времени платежа и имени плательщика из СМС банка; при сомнении — звонок пациенту. Автоматически запись не снимается, пока по ней есть заявленная оплата.`}
          incoming={r.incoming.map(i => ({ id: i.id, amount: rub(i.amountKopecks), time: tstamp(i.receivedAt), text: i.text }))}
          waiting={waiting} preselect={pre && waiting.some(w => w.id === pre) ? pre : null} />
      </main>
    </>
  );
}
