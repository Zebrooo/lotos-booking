import type { Metadata, Viewport } from "next";
import { Onest } from "next/font/google";
import "./lotos-soft.css";
import "./app.css";
import { CookieConsent } from "@/components/common/cookie-consent";
import { readCookieChoice } from "@/lib/cookies/actions";

// Шрифт дизайна раздаётся с нашего сервера: браузер пациента не ходит в Google.
const onest = Onest({ subsets: ["latin", "cyrillic"], variable: "--font-onest", display: "swap" });

export const metadata: Metadata = {
  title: "Запись к врачу · Лотос",
  description: "Онлайн-запись в медицинский центр «Лотос»",
};
export const viewport: Viewport = { width: "device-width", initialScale: 1 };

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const cookieChoice = await readCookieChoice();
  return (
    <html lang="ru" className={onest.variable}>
      <body>{children}<CookieConsent initialChoice={cookieChoice} /></body>
    </html>
  );
}
