// Вход сотрудников. Экрана нет в макете — сделан в языке входа в кабинет.
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { currentStaff } from "@/lib/staff/session-view";
import { StaffLoginForm } from "./login-form";

export const metadata: Metadata = { title: "Вход · CRM Лотос", robots: { index: false } };

export default async function StaffLogin() {
  const s = await currentStaff();
  if (s) redirect(s.role === "doctor" ? "/crm/moy-priem" : "/crm/raspisanie");
  return (
    <main style={{ minHeight: "100vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 24, padding: 24, background: "var(--color-bg)" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <div style={{ width: 18, height: 18, background: "var(--color-accent)", borderRadius: "60% 0 60% 0", transform: "rotate(-45deg)" }} />
        <div style={{ display: "flex", flexDirection: "column", lineHeight: 1.05 }}><span style={{ fontWeight: 800, fontSize: 17 }}>ЛОТОС</span><span style={{ fontSize: 11, color: "var(--color-neutral-700)" }}>регистратура</span></div>
      </div>
      <StaffLoginForm />
    </main>
  );
}
