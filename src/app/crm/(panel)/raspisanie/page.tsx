// Расписание дня: колонки врачей, записи по состояниям, снятие приёма.
import type { Metadata } from "next";
import { app } from "@/lib/app";
import { crmContext } from "@/lib/crm/context";
import { crmDay } from "@/lib/crm/data";
import { bookingVM, dayl, dayOptions } from "@/lib/crm/view";
import { localDay, addDays } from "@/domain/time";
import { hhmmOf, plural, dateNum } from "@/lib/format";
import { first, positiveInt } from "@/lib/params";
import { CrmHeader } from "@/components/crm/shell";
import { ScheduleView, type ColumnVM } from "@/components/crm/schedule";
import { RequestBanner } from "@/components/crm/request-banner";

export const metadata: Metadata = { title: "Расписание · CRM Лотос" };

export default async function Schedule(props: PageProps<"/crm/raspisanie">) {
  const { staff, settings, now, request } = await crmContext(["admin", "senior"]);
  const sp = await props.searchParams;
  const today = localDay(now);
  const asked = first(sp.den) ?? "";
  const day = /^\d{4}-\d{2}-\d{2}$/.test(asked) && asked >= addDays(today, -7) && asked <= addDays(today, 90) ? asked : today;
  const { sql, adapters } = app();
  const cols = await crmDay(sql, adapters.clock, day);
  const vms: ColumnVM[] = cols.map(c => ({
    id: c.id, short: c.short, spec: c.spec, room: c.room, off: c.off,
    stat: c.off ? "снят" : `${c.bookings.length} ${plural(c.bookings.length, "запись", "записи", "записей")}`,
    group: c.group ? `группа ${c.group.have}/${c.group.min} · решить до ${localDay(c.group.decideAt) === today ? "" : `${dateNum(localDay(c.group.decideAt))} `}${hhmmOf(c.group.decideAt)}` : null,
    quota: c.quota, items: c.bookings.map(b => bookingVM(b, now)),
  }));
  const snyat = positiveInt(first(sp.snyat));
  const reason = first(sp.prichina) ?? "";
  const days = dayOptions(today);
  if (!days.some(d => d.day === day)) days.push({ day, label: dayl(day) });
  return (
    <>
      <CrmHeader title="Расписание" role={staff.role} paused={settings.onlineBookingPaused}
        days={days.map(d => ({ href: `/crm/raspisanie?den=${d.day}`, label: d.label, on: d.day === day }))} />
      <main style={{ padding: "20px 24px 48px", display: "flex", flexDirection: "column", gap: 16, minWidth: 0 }}>
        <RequestBanner request={request} />
        <ScheduleView key={`${day}:${snyat ?? ""}`} day={day} dayTitle={dayl(day)} cols={vms} canCancel={staff.role !== "doctor"}
          openDayOff={snyat ? { doctorId: snyat, reason: ["Болезнь", "Не набрали пациентов", "Другое"].includes(reason) ? reason : "Болезнь" } : null} />
      </main>
    </>
  );
}
