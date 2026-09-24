"use client";
import { useActionState } from "react";
import { ui } from "@/components/ui";
import type { TransferState } from "../actions";

/** Форма переноса: окна — радиокнопки внутри формы, ошибка сценария — сверху. */
export function TransferForm({ action, doctorId, children }: {
  action: (prev: TransferState, formData: FormData) => Promise<TransferState>;
  doctorId: number;
  children: React.ReactNode;
}) {
  const [state, formAction, pending] = useActionState(action, { error: null });
  return (
    <form action={formAction} className="space-y-5">
      {state.error && <p role="alert" className="rounded-xl border border-red-300 bg-red-50 p-3 text-sm text-red-800">{state.error}</p>}
      <input type="hidden" name="doctor" value={doctorId} />
      {children}
      <button disabled={pending} className={`${ui.btn} ${ui.primary}`}>{pending ? "Переносим…" : "Перенести на выбранное время"}</button>
    </form>
  );
}
