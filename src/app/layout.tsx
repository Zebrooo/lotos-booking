import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Запись к врачу · Лотос",
  description: "Онлайн-запись в медицинский центр «Лотос»",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ru">
      <body>{children}</body>
    </html>
  );
}
