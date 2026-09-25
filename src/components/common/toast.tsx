"use client";
// Всплывающее сообщение внизу экрана — как toast в прототипах. Управляемое:
// показывает message, через 3,2 секунды просит родителя его убрать.
import { useEffect } from "react";

export function Toast({ message, onDone }: { message: string | null; onDone: () => void }) {
  useEffect(() => {
    if (!message) return;
    const t = setTimeout(onDone, 3200);
    return () => clearTimeout(t);
  }, [message, onDone]);
  if (!message) return null;
  return (
    <div role="status" style={{ position: "fixed", left: "50%", bottom: 24, transform: "translateX(-50%)", zIndex: 40, background: "var(--color-text)", color: "#fff", padding: "12px 20px", borderRadius: 999, fontSize: 14, fontWeight: 600, boxShadow: "var(--shadow-lg)", maxWidth: "calc(100% - 32px)", textAlign: "center" }}>{message}</div>
  );
}
