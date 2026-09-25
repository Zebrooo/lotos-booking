"use client";
// Кнопка «Сохранить PDF»: открывает системный диалог печати, где есть «Сохранить как PDF».
// При первом открытии страницы диалог вызывается сам — как «Скачать PDF» в прототипе.
import { useEffect } from "react";

export function PrintButton() {
  useEffect(() => {
    const t = setTimeout(() => window.print(), 300);
    return () => clearTimeout(t);
  }, []);
  return <button className="btn btn-primary no-print" onClick={() => window.print()}>Сохранить PDF</button>;
}
