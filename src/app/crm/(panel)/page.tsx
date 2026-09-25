import { redirect } from "next/navigation";
import { requireStaff } from "@/lib/staff/session-view";

export default async function CrmHome() {
  const s = await requireStaff();
  redirect(s.role === "doctor" ? "/crm/moy-priem" : "/crm/raspisanie");
}
