import type { Metadata } from "next";
import Link from "next/link";
import { appConfig } from "@/lib/config";
import { ui } from "@/components/ui";
import "./globals.css";

export const metadata: Metadata = {
  title: "Запись к врачу · Лотос",
  description: "Онлайн-запись в медицинский центр «Лотос»",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const { clinic } = appConfig(process.env, { strict: false });
  return (
    <html lang="ru">
      <body className="flex min-h-screen flex-col bg-slate-50 text-slate-900 antialiased">
        <header className="border-b border-slate-200 bg-white">
          <div className={`${ui.page} flex items-center justify-between gap-4 py-4`}>
            <Link href="/" className="flex items-center gap-3">
              <span aria-hidden className="grid size-9 place-items-center rounded-xl bg-teal-700 text-lg text-white">❀</span>
              <span className="leading-tight">
                <span className="block font-semibold">{clinic.name}</span>
                <span className="block text-xs text-slate-500">Онлайн-запись к врачу</span>
              </span>
            </Link>
            <a href={`tel:${clinic.phone.replace(/[^\d+]/g, "")}`} className="hidden text-sm font-medium text-slate-700 sm:block">{clinic.phone}</a>
          </div>
        </header>
        <main className={`${ui.page} flex-1 py-6 sm:py-10`}>{children}</main>
        <footer className="border-t border-slate-200 bg-white">
          <div className={`${ui.page} flex flex-col gap-3 py-6 text-sm text-slate-600 sm:flex-row sm:justify-between`}>
            <div>
              <div className="font-medium text-slate-800">{clinic.name}</div>
              <div>{clinic.address}</div>
              <div>{clinic.phone}</div>
            </div>
            <nav className="flex flex-col gap-1">
              <Link className={ui.link} href="/dokumenty/predoplata">Условия предоплаты</Link>
              <Link className={ui.link} href="/dokumenty/soglasie-pd">Согласие на обработку данных</Link>
              <Link className={ui.link} href="/dokumenty/oferta">Договор-оферта</Link>
              <Link className={ui.link} href="/dokumenty/politika">Политика обработки данных</Link>
            </nav>
          </div>
        </footer>
      </body>
    </html>
  );
}
