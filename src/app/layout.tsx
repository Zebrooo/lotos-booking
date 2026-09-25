import type { Metadata, Viewport } from "next";
import { Onest } from "next/font/google";
import "./lotos-soft.css";
import "./app.css";

// Шрифт дизайна раздаётся с нашего сервера: браузер пациента не ходит в Google.
const onest = Onest({ subsets: ["latin", "cyrillic"], variable: "--font-onest", display: "swap" });

export const metadata: Metadata = {
  title: "Запись к врачу · Лотос",
  description: "Онлайн-запись в медицинский центр «Лотос»",
};
export const viewport: Viewport = { width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ru" className={onest.variable}>
      <body>{children}</body>
    </html>
  );
}
