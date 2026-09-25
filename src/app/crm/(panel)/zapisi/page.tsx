// Все записи: поиск, фильтры по состоянию и врачу, шторка записи.
import type { Metadata } from "next";
import { app } from "@/lib/app";
import { crmContext } from "@/lib/crm/context";
import { crmBookings, crmDoctors } from "@/lib/crm/data";
import { bookingVM } from "@/lib/crm/view";
import { localDay, addDays } from "@/domain/time";
import { CrmHeader } from "@/components/crm/shell";
import { ListView } from "@/components/crm/views";
import { RequestBanner } from "@/components/crm/request-banner";

export const metadata: Metadata = { title: "Записи · CRM Лотос" };

export default async function Bookings() {
  const { staff, settings, now, request } = await crmContext(["admin", "senior"]);
  const { sql, adapters } = app();
  const today = localDay(now);
  // Окно списка: месяц назад и два месяца вперёд — этого хватает смене; старое ищут по номеру.
  const all = await crmBookings(sql, adapters.clock, { from: addDays(today, -30), to: addDays(today, 60), limit: 2000 });
  // Сначала сегодня и дальше по времени, прошедшие дни — ниже, от свежих к старым.
  const upcoming = all.filter(b => b.day >= today);
  const past = all.filter(b => b.day < today).reverse();
  const items = [...upcoming, ...past].map(b => bookingVM(b, now));
  const doctors = (await crmDoctors(sql)).map(d => ({ id: d.id, short: d.short }));
  return (
    <>
      <CrmHeader title="Записи" role={staff.role} paused={settings.onlineBookingPaused} />
      <main style={{ padding: "20px 24px 48px", display: "flex", flexDirection: "column", gap: 16, minWidth: 0 }}>
        <RequestBanner request={request} />
        <ListView items={items} doctors={doctors} />
      </main>
    </>
  );
}
