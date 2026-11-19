"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { BookingServiceItem } from "@/domain/booking-service";
import { hhmm, localTime } from "@/domain/time";
import { dateNum, dayLong, plural, relName, rub, wdShort } from "@/lib/format";
import { labServicesQuery } from "@/lib/lab-pool";
import { asideStyle, kicker, SummaryRows } from "./summary";

export function LabBooking(props: {
  items: BookingServiceItem[];
  resourceTitle: string;
  today: string;
  days: { day: string; slots: number[] }[];
  initialDay: string | null;
}) {
  const router = useRouter();
  const initial = Math.max(0, props.days.findIndex(day => day.day === props.initialDay));
  const [dayIndex, setDayIndex] = useState(initial);
  const [slot, setSlot] = useState<number | null>(null);
  const day = props.days[dayIndex];
  const query = labServicesQuery(props.items.map(item => item.serviceId));
  const duration = props.items.reduce((sum, item) => sum + item.durationMin, 0);
  const price = props.items.reduce((sum, item) => sum + item.priceKopecks, 0);
  const prepay = props.items.reduce((sum, item) => sum + item.prepayKopecks, 0);
  const when = day && slot != null ? `${dayLong(day.day, props.today)}, ${hhmm(slot)}` : "—";
  const next = () => {
    if (!day || slot == null) return;
    const start = localTime(day.day, slot).toISOString();
    router.push(`/analizy/zapis/dannye?services=${query}&start=${encodeURIComponent(start)}`);
  };
  return (
    <section style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <Link href={`/analizy?services=${query}`} className="plain-link" style={{ fontSize: 14, color: "var(--color-accent-700)" }}>← Изменить анализы</Link>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <span style={kicker}>Процедурный кабинет</span>
        <h1 style={{ margin: 0, fontSize: "var(--h1-size)", lineHeight: 1.05 }}>Выберите день и время</h1>
        <span style={{ color: "var(--color-neutral-700)" }}>Все выбранные анализы будут сданы за один визит · {duration} минут</span>
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 32, alignItems: "flex-start" }}>
        <div style={{ flex: "1 1 520px", minWidth: 0, display: "flex", flexDirection: "column", gap: 26 }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <span style={kicker}>Состав записи</span>
            {props.items.map(item => (
              <div key={item.serviceId} style={{ display: "flex", justifyContent: "space-between", gap: 16, padding: "10px 0", borderBottom: "1px solid var(--color-divider)" }}>
                <span>{item.title}{item.code ? ` · № ${item.code}` : ""}</span><strong style={{ whiteSpace: "nowrap" }}>{rub(item.priceKopecks)}</strong>
              </div>
            ))}
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <span style={kicker}>День</span>
            <div style={{ display: "flex", gap: 6, overflowX: "auto", paddingBottom: 4 }}>
              {props.days.map((d, index) => {
                const selected = index === dayIndex;
                return (
                  <button key={d.day} onClick={() => { setDayIndex(index); setSlot(null); }} disabled={d.slots.length === 0}
                    aria-pressed={selected} title={d.slots.length === 0 ? "Свободного времени нет" : `${d.slots.length} ${plural(d.slots.length, "окно", "окна", "окон")}`}
                    style={{ flex: "1 0 66px", font: "inherit", border: `1px solid ${selected ? "var(--color-accent)" : "var(--color-divider)"}`, borderRadius: 18, padding: "10px 8px", display: "flex", flexDirection: "column", gap: 3, background: selected ? "var(--color-accent)" : "var(--color-bg)", color: selected ? "var(--color-bg)" : "var(--color-text)", opacity: d.slots.length === 0 ? 0.4 : 1 }}>
                    <span style={{ fontSize: 11, textTransform: "uppercase" }}>{wdShort(d.day)}</span>
                    <strong style={{ fontSize: 20 }}>{Number(d.day.slice(8, 10))}</strong>
                    <span style={{ fontSize: 10 }}>{relName(d.day, props.today) || dateNum(d.day)}</span>
                  </button>
                );
              })}
            </div>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <span style={kicker}>Время · {day ? dayLong(day.day, props.today) : ""}</span>
            {!day?.slots.length && <span style={{ fontSize: 14, color: "var(--color-neutral-700)" }}>Свободного времени нет. Выберите другой день.</span>}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(84px,1fr))", gap: 6 }}>
              {day?.slots.map(minutes => (
                <button key={minutes} onClick={() => setSlot(minutes)} aria-pressed={slot === minutes}
                  style={{ font: "inherit", padding: "11px", border: `1px solid ${slot === minutes ? "var(--color-accent)" : "var(--color-divider)"}`, background: slot === minutes ? "var(--color-accent)" : "var(--color-bg)", color: slot === minutes ? "var(--color-bg)" : "var(--color-text)", cursor: "pointer" }}>{hhmm(minutes)}</button>
              ))}
            </div>
          </div>
        </div>
        <aside style={asideStyle}>
          <span style={kicker}>Ваша запись</span>
          <SummaryRows rows={[
            { k: "Место", v: props.resourceTitle },
            { k: "Анализы", v: `${props.items.length} ${plural(props.items.length, "позиция", "позиции", "позиций")}` },
            { k: "Когда", v: when },
            { k: "Стоимость", v: rub(price) },
          ]} />
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}><span style={{ fontSize: 14 }}>Предоплата сейчас</span><strong style={{ fontSize: 26 }}>{rub(prepay)}</strong></div>
          <span style={{ fontSize: 12, color: "var(--color-neutral-700)" }}>Остаток {rub(price - prepay)} — в клинике в день визита.</span>
          <button className="btn btn-primary" onClick={next} disabled={slot == null} style={{ padding: "14px 16px", justifyContent: "space-between" }}>{slot == null ? "Выберите время" : "Продолжить"}<span>→</span></button>
        </aside>
      </div>
    </section>
  );
}
