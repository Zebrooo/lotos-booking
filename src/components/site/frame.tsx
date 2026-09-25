// Рамка сайта: шапка, содержимое, подвал; ширина до 1280 пикселей, как в прототипе.
import { appConfig } from "@/lib/config";
import { currentPatientInitial } from "@/lib/cabinet/session-view";
import { SiteHeader } from "./header";
import { SiteFooter } from "./footer";
import { app } from "@/lib/app";
import { loadSettings } from "@/lib/usecases/settings";

export async function SiteFrame({ children }: { children: React.ReactNode }) {
  const { clinic } = appConfig(process.env, { strict: false });
  const initial = await currentPatientInitial();
  // Пауза из CRM (старший смены): сайт честно говорит, что записи сейчас нет.
  const paused = (await loadSettings(app().sql)).onlineBookingPaused;
  return (
    <div style={{ minHeight: "100vh", background: "var(--color-bg)", display: "flex", justifyContent: "center" }}>
      <div style={{ width: "100%", maxWidth: 1280, background: "var(--color-bg)", minHeight: "100vh", display: "flex", flexDirection: "column" }}>
        <SiteHeader phone={clinic.phone} initial={initial} />
        {paused && (
          <div role="status" style={{ margin: "12px 24px 0", padding: "14px 20px", borderRadius: 20, background: "var(--color-accent-100)", color: "var(--color-accent-800)", display: "flex", gap: "4px 16px", flexWrap: "wrap", alignItems: "baseline" }}>
            <span style={{ fontWeight: 800 }}>Онлайн-запись временно недоступна</span>
            <span style={{ fontSize: 14 }}>Позвоните в регистратуру: <a href={`tel:${clinic.phone.replace(/[^\d+]/g, "")}`} style={{ color: "inherit", fontWeight: 700 }}>{clinic.phone}</a>. Уже сделанные записи и оплаты в силе.</span>
          </div>
        )}
        {children}
        <SiteFooter clinic={clinic} />
      </div>
    </div>
  );
}
