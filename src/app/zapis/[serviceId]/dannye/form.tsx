"use client";
import { useActionState, useState } from "react";
import Link from "next/link";
import { ui } from "@/components/ui";
import type { BookFormState } from "./actions";

type Props = {
  action: (prev: BookFormState, formData: FormData) => Promise<BookFormState>;
  prepayLabel: string;
  prepayTerms: string;
};

const RELATIONS = [
  { value: "self", label: "Себя" },
  { value: "child", label: "Ребёнка" },
  { value: "relative", label: "Родственника" },
] as const;

export function BookingForm({ action, prepayLabel, prepayTerms }: Props) {
  const [state, formAction, pending] = useActionState(action, { errors: {}, values: { relation: "self" } });
  const [relation, setRelation] = useState(state.values.relation ?? "self");
  const e = state.errors;
  const v = state.values;
  const field = (name: string) => ({
    id: name, name, defaultValue: v[name] ?? "", "aria-invalid": e[name] ? true : undefined,
    "aria-describedby": e[name] ? `${name}-error` : undefined, className: ui.input,
  });
  const err = (name: string) => e[name] && <p id={`${name}-error`} className={ui.error}>{e[name]}</p>;

  return (
    <form action={formAction} className={`${ui.card} space-y-5`} noValidate>
      {e._form && <p role="alert" className="rounded-xl border border-red-300 bg-red-50 p-3 text-sm text-red-800">{e._form}</p>}

      <fieldset>
        <legend className={ui.label}>Кого записываете</legend>
        <div className="mt-2 flex flex-wrap gap-2">
          {RELATIONS.map(r => (
            <label key={r.value} className={`${ui.chip} cursor-pointer border-slate-300 bg-white has-[:checked]:border-teal-700 has-[:checked]:bg-teal-50`}>
              <input type="radio" name="relation" value={r.value} checked={relation === r.value} onChange={() => setRelation(r.value)} className="mr-2 accent-teal-700" />
              {r.label}
            </label>
          ))}
        </div>
        {relation === "relative" && (
          <p className={`${ui.muted} mt-2`}>Записывая родственника, вы подтверждаете, что он согласен на запись. Письменное согласие на обработку данных он подпишет в клинике.</p>
        )}
        {err("relation")}
      </fieldset>

      {relation !== "self" && (
        <div>
          <label htmlFor="bookerName" className={ui.label}>Ваши фамилия и имя</label>
          <input {...field("bookerName")} autoComplete="name" />
          {err("bookerName")}
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <label htmlFor="fullName" className={ui.label}>{relation === "self" ? "Фамилия, имя, отчество" : "ФИО пациента"}</label>
          <input {...field("fullName")} autoComplete={relation === "self" ? "name" : "off"} />
          {err("fullName")}
        </div>
        <div>
          <label htmlFor="birthDate" className={ui.label}>Дата рождения{relation === "self" ? "" : " пациента"}</label>
          <input {...field("birthDate")} type="date" autoComplete={relation === "self" ? "bday" : "off"} />
          {err("birthDate")}
        </div>
        <div>
          <label htmlFor="phone" className={ui.label}>Телефон{relation === "self" ? "" : " для связи"}</label>
          <input {...field("phone")} type="tel" inputMode="tel" autoComplete="tel" placeholder="+7 900 000-00-00" />
          {err("phone")}
        </div>
        <div className="sm:col-span-2">
          <label htmlFor="email" className={ui.label}>Электронная почта</label>
          <input {...field("email")} type="email" autoComplete="email" placeholder="name@example.ru" />
          <p className={ui.muted}>Сюда придут подтверждение, кассовый чек и напоминание.</p>
          {err("email")}
        </div>
      </div>

      <div className="space-y-3 rounded-xl bg-slate-50 p-4">
        <p className="text-sm text-slate-700">{prepayTerms}</p>
        <label className="flex gap-3 text-sm">
          <input type="checkbox" name="consentPrepay" defaultChecked={v.consentPrepay === "on"} className="mt-0.5 size-4 accent-teal-700" aria-invalid={e.consentPrepay ? true : undefined} />
          <span>Я ознакомлен(а) с <Link className={ui.link} href="/dokumenty/predoplata" target="_blank">условиями предоплаты</Link> и согласен(на) с ними</span>
        </label>
        {err("consentPrepay")}
        <label className="flex gap-3 text-sm">
          <input type="checkbox" name="consentPd" defaultChecked={v.consentPd === "on"} className="mt-0.5 size-4 accent-teal-700" aria-invalid={e.consentPd ? true : undefined} />
          <span>Даю <Link className={ui.link} href="/dokumenty/soglasie-pd" target="_blank">согласие на обработку персональных данных</Link></span>
        </label>
        {err("consentPd")}
      </div>

      <button disabled={pending} className={`${ui.btn} ${ui.primary} w-full py-3 text-base`}>
        {pending ? "Записываем…" : `Перейти к оплате ${prepayLabel}`}
      </button>
    </form>
  );
}
