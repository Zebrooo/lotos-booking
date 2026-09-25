// Бумажный лист на следующий рабочий день — на случай, если система недоступна.
import type { Metadata } from "next";
import { app } from "@/lib/app";
import { crmContext } from "@/lib/crm/context";
import { printData } from "@/lib/crm/data";
import { bookingVM } from "@/lib/crm/view";
import { localDay, addDays, weekday } from "@/domain/time";
import { dateNum, hhmmOf, plural } from "@/lib/format";
import { CrmHeader } from "@/components/crm/shell";
import { PrintButton } from "@/components/crm/views";
import { RequestBanner } from "@/components/crm/request-banner";

export const metadata: Metadata = { title: "Печать на завтра · CRM Лотос" };
const WD = ["", "понедельник", "вторник", "среда", "четверг", "пятница", "суббота", "воскресенье"];

export default async function PrintTomorrow() {
  const { staff, settings, now, request } = await crmContext(["admin", "senior"]);
  const { sql, adapters } = app();
  const today = localDay(now);
  const works = new Set((await sql<{ weekday: number }[]>`select distinct weekday from schedule_rules`).map(r => r.weekday));
  let day = addDays(today, 1);
  for (let i = 0; i < 7 && works.size && !works.has(weekday(day)); i++) day = addDays(day, 1);
  const groups = await printData(sql, adapters.clock, day);
  const total = groups.reduce((a, g) => a + g.rows.length, 0);
  const stamp = `${today.slice(8, 10)}.${today.slice(5, 7)}.${today.slice(0, 4)} ${hhmmOf(now)}`;
  const th: React.CSSProperties = { padding: "4px 6px" };
  const td: React.CSSProperties = { padding: "5px 6px" };
  return (
    <>
      <CrmHeader title="Печать на завтра" role={staff.role} paused={settings.onlineBookingPaused} />
      <main style={{ padding: "20px 24px 48px", display: "flex", flexDirection: "column", gap: 16, minWidth: 0 }}>
        <RequestBanner request={request} />
        <div className="no-print" style={{ display: "flex", gap: 12, alignItems: "center" }}>
          <PrintButton />
          <span style={{ fontSize: 13, color: "var(--color-neutral-700)" }}>Бумажная копия на случай, если система недоступна. Распечатайте вечером, когда запись на завтра закрыта.</span>
        </div>
        <div style={{ background: "#fff", boxShadow: "var(--shadow-md)", padding: "40px 44px", maxWidth: 900, display: "flex", flexDirection: "column", gap: 20, color: "#000", borderRadius: 24 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", borderBottom: "2px solid #000", paddingBottom: 10 }}>
            <div style={{ display: "flex", flexDirection: "column" }}>
              <span style={{ fontWeight: 800, fontSize: 22 }}>Записи на {dateNum(day)} {day.slice(0, 4)}, {WD[weekday(day)]}</span>
              <span style={{ fontSize: 12 }}>МЦ «Лотос» · сформировано {stamp} · {total} {plural(total, "запись", "записи", "записей")}</span>
            </div>
            <span style={{ fontSize: 12 }}>лист 1</span>
          </div>
          {groups.map(g => (
            <div key={g.doctor.id} style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <span style={{ fontWeight: 800, fontSize: 15 }}>{g.doctor.short} <span style={{ fontWeight: 400, fontSize: 13 }}>— {g.doctor.spec}{g.doctor.room ? `, каб. ${g.doctor.room}` : ""}</span></span>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                <thead><tr style={{ textAlign: "left", borderBottom: "1.5px solid #000" }}><th style={{ ...th, width: 52 }}>Время</th><th style={th}>Пациент</th><th style={th}>Д. р.</th><th style={th}>Телефон</th><th style={th}>Услуга</th><th style={th}>Аванс</th><th style={{ ...th, width: 70 }}>Явка</th></tr></thead>
                <tbody>
                  {g.rows.map(b => { const v = bookingVM(b, now); return (
                    <tr key={b.id} style={{ borderBottom: "1px solid #999" }}><td style={{ ...td, fontWeight: 700 }}>{v.time}</td><td style={td}>{v.patient}</td><td style={td}>{v.dob}</td><td style={{ ...td, whiteSpace: "nowrap" }}>{v.phone}</td><td style={td}>{v.svc}</td><td style={td}>{v.paid ? "оплачен" : "НЕ оплачен"}</td><td style={td}>☐</td></tr>
                  ); })}
                </tbody>
              </table>
            </div>
          ))}
          {groups.length === 0 && <span style={{ fontSize: 13 }}>Записей на этот день нет.</span>}
        </div>
      </main>
    </>
  );
}
