"use client";
// Кнопки «Моей записи» и окно «Отменить запись?» — как в прототипе.
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Toast } from "@/components/common/toast";

export function MyBookingActions(props: {
  when: string; docShort: string; paid: boolean; paidMinutesAgo: number | null; rescheduleHref: string | null; refundHow?: "card" | "cash" | "bank";
  canPay: boolean; prepayLabel: string; pay: () => Promise<void>; cancel: () => Promise<void>;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const how = props.refundHow ?? "card";
  const refundTitle = !props.paid ? "Предоплата не вносилась"
    : how === "cash" ? `Вернём ${props.prepayLabel} наличными` : how === "bank" ? `Вернём ${props.prepayLabel} переводом` : `Вернём ${props.prepayLabel} на карту`;
  const refundSub = !props.paid ? "Время освободится для других пациентов."
    : how === "cash" ? "Предоплату вы вносили в регистратуре — заберите её там с паспортом. Чек возврата пришлём в СМС."
    : how === "bank" ? "Регистратура свяжется с вами, чтобы уточнить реквизиты. Чек возврата пришлём в СМС."
    : `${props.paidMinutesAgo != null && props.paidMinutesAgo < 60 ? "Вы оплатили меньше часа назад — возврат полный, без вопросов. " : ""}Деньги вернутся на ту же карту; срок зачисления зависит от банка. Чек возврата пришлём в СМС.`;
  return (
    <>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {props.canPay && (
          <button className="btn btn-primary" onClick={() => startTransition(() => props.pay())} disabled={pending} style={{ padding: "14px 16px", minWidth: 200, justifyContent: "space-between" }}>Оплатить {props.prepayLabel}<span>→</span></button>
        )}
        <button className="btn btn-secondary" onClick={() => props.rescheduleHref ? router.push(props.rescheduleHref) : setToast("Перенести эту запись можно по телефону клиники")} style={{ padding: "14px 16px", minWidth: 200, justifyContent: "space-between" }}>Перенести<span>→</span></button>
        <button className="btn btn-secondary" onClick={() => setOpen(true)} style={{ padding: "14px 16px", minWidth: 200, justifyContent: "space-between", color: "var(--color-danger)" }}>Отменить запись<span>×</span></button>
      </div>
      <span style={{ fontSize: 13, color: "var(--color-neutral-700)" }}>При переносе предоплата переходит на новую запись — платить повторно не нужно.</span>
      {open && (
        <div className="dialog-backdrop" style={{ zIndex: 10 }}>
          <div className="dialog" role="dialog" aria-modal="true" aria-labelledby="cancel-title" style={{ width: "min(480px,100%)", background: "var(--color-bg)", gap: 14 }}>
            <span id="cancel-title" className="dialog-title">Отменить запись?</span>
            <span style={{ fontSize: 15 }}>{props.when} · {props.docShort}</span>
            <div style={{ background: "var(--color-surface)", padding: 14, display: "flex", flexDirection: "column", gap: 4, borderRadius: 24 }}>
              <span style={{ fontWeight: 800 }}>{refundTitle}</span>
              <span style={{ fontSize: 13, textWrap: "pretty" }}>{refundSub}</span>
            </div>
            <div className="dialog-actions" style={{ justifyContent: "flex-start" }}>
              <button className="btn btn-primary" onClick={() => startTransition(async () => { await props.cancel(); setOpen(false); })} disabled={pending} style={{ padding: "12px 16px" }}>Отменить запись</button>
              <button className="btn btn-secondary" onClick={() => setOpen(false)} style={{ padding: "12px 16px" }}>Оставить</button>
            </div>
          </div>
        </div>
      )}
      <Toast message={toast} onDone={() => setToast(null)} />
    </>
  );
}
