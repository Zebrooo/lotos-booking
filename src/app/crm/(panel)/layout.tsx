// Каркас CRM: меню слева, плашка паузы, дальше страница.
import type { Metadata } from "next";
import { app } from "@/lib/app";
import { crmContext } from "@/lib/crm/context";
import { Sidebar, PauseBanner } from "@/components/crm/shell";

export const metadata: Metadata = { title: "CRM · Лотос", robots: { index: false } };

export default async function PanelLayout({ children }: { children: React.ReactNode }) {
  const { staff, settings, pauseInfo } = await crmContext();
  const { sql } = app();
  let badge = 0;
  if (staff.role !== "doctor") {
    const [n] = await sql<{ n: number }[]>`select (select count(*) from bookings where status = 'claimed')::int
      + (select count(*) from bank_incoming where matched_booking_id is null)::int as n`;
    badge = n?.n ?? 0;
  }
  return (
    <div style={{ display: "grid", gridTemplateColumns: "220px minmax(0,1fr)", minHeight: "100vh", background: "var(--color-bg)", fontSize: 14 }}>
      <Sidebar role={staff.role} name={staff.fullName} reconBadge={badge} />
      <div style={{ display: "flex", flexDirection: "column", minWidth: 0 }}>
        <PauseBanner paused={settings.onlineBookingPaused} info={pauseInfo} isSenior={staff.role === "senior"} />
        {children}
      </div>
    </div>
  );
}
