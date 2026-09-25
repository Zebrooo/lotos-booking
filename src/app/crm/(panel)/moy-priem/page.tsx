// «Мой приём» врача: сегодня и завтра, запрос на снятие приёма.
import type { Metadata } from "next";
import { app } from "@/lib/app";
import { crmContext } from "@/lib/crm/context";
import { doctorDays } from "@/lib/crm/data";
import { bookingVM, dayl } from "@/lib/crm/view";
import { localDay } from "@/domain/time";
import { dateNum, plural } from "@/lib/format";
import { CrmHeader } from "@/components/crm/shell";
import { DoctorView } from "@/components/crm/views";

export const metadata: Metadata = { title: "Мой приём · CRM Лотос" };

export default async function MyDay() {
  const { staff, settings, now } = await crmContext(["doctor"]);
  const { sql, adapters } = app();
  const days = await doctorDays(sql, adapters.clock, staff.resourceId!);
  const today = localDay(now);
  const [req] = await sql<{ text: string }[]>`select text from doctor_requests where resource_id = ${staff.resourceId} and handled_at is null and day >= ${today} order by created_at desc limit 1`;
  return (
    <>
      <CrmHeader title="Мой приём" role={staff.role} paused={settings.onlineBookingPaused} />
      <main style={{ padding: "20px 24px 48px", display: "flex", flexDirection: "column", gap: 16, minWidth: 0 }}>
        <DoctorView sent={req?.text ?? null}
          days={days.map(d => ({ title: dayl(d.day), stat: `${d.rows.length} ${plural(d.rows.length, "пациент", "пациента", "пациентов")}`, off: d.off != null, rows: d.rows.map(b => bookingVM(b, now)) }))}
          options={days.map((d, i) => ({ day: d.day, label: `${dateNum(d.day)} — ${i === 0 ? "сегодня" : "завтра"}`, dayText: `На ${dateNum(d.day)}`, paid: d.rows.filter(b => b.money === "advance").length }))} />
      </main>
    </>
  );
}
