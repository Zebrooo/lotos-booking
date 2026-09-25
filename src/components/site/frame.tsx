// Рамка сайта: шапка, содержимое, подвал; ширина до 1280 пикселей, как в прототипе.
import { appConfig } from "@/lib/config";
import { currentPatientInitial } from "@/lib/cabinet/session-view";
import { SiteHeader } from "./header";
import { SiteFooter } from "./footer";

export async function SiteFrame({ children }: { children: React.ReactNode }) {
  const { clinic } = appConfig(process.env, { strict: false });
  const initial = await currentPatientInitial();
  return (
    <div style={{ minHeight: "100vh", background: "var(--color-bg)", display: "flex", justifyContent: "center" }}>
      <div style={{ width: "100%", maxWidth: 1280, background: "var(--color-bg)", minHeight: "100vh", display: "flex", flexDirection: "column" }}>
        <SiteHeader phone={clinic.phone} initial={initial} />
        {children}
        <SiteFooter clinic={clinic} />
      </div>
    </div>
  );
}
