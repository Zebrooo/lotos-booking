import Link from "next/link";
import type { Slot } from "@/domain/slots";
import { formatDay, formatTime } from "@/lib/texts";
import { ui } from "./ui";

/**
 * Дни и окна. Дни — ссылками (меняют параметр day), окна — ссылками на
 * следующий шаг или радиокнопками формы, если передан name.
 */
export function SlotPicker(props: {
  days: { day: string; slots: Slot[] }[];
  selectedDay: string | null;
  dayHref: (day: string) => string;
  slotHref?: (slot: Slot) => string;
  radioName?: string;
}) {
  const selected = props.days.find(d => d.day === props.selectedDay);
  const withSlots = props.days.filter(d => d.slots.length > 0);
  if (withSlots.length === 0) {
    return <p className={ui.card}>Свободного времени в ближайшие дни нет. Попробуйте другого врача или запишитесь по телефону клиники.</p>;
  }
  return (
    <div className="space-y-5">
      <div>
        <h2 className={`${ui.h2} mb-2`}>День</h2>
        <ul className="flex gap-2 overflow-x-auto pb-2">
          {props.days.map(d => {
            const active = d.day === props.selectedDay;
            const empty = d.slots.length === 0;
            return (
              <li key={d.day} className="shrink-0">
                {empty ? (
                  <span className={`${ui.chip} flex-col border-slate-200 bg-slate-100 text-slate-400`} aria-disabled>
                    <span>{formatDay(d.day)}</span><span className="text-xs">нет окон</span>
                  </span>
                ) : (
                  <Link href={props.dayHref(d.day)} scroll={false} aria-current={active ? "date" : undefined}
                    className={`${ui.chip} flex-col ${active ? "border-teal-700 bg-teal-700 text-white" : "border-slate-300 bg-white text-slate-800 hover:border-teal-600"}`}>
                    <span>{formatDay(d.day)}</span>
                    <span className={`text-xs ${active ? "text-teal-100" : "text-slate-500"}`}>{d.slots.length} окон</span>
                  </Link>
                )}
              </li>
            );
          })}
        </ul>
      </div>
      {selected && (
        <div>
          <h2 className={`${ui.h2} mb-2`}>Время · {formatDay(selected.day)}</h2>
          <ul className="grid grid-cols-3 gap-2 sm:grid-cols-6">
            {selected.slots.map(s => (
              <li key={s.startsAt.toISOString()}>
                {props.radioName ? (
                  <label className={`${ui.chip} w-full cursor-pointer border-slate-300 bg-white has-[:checked]:border-teal-700 has-[:checked]:bg-teal-700 has-[:checked]:text-white`}>
                    <input type="radio" name={props.radioName} value={s.startsAt.toISOString()} className="sr-only" required />
                    {formatTime(s.startsAt)}
                  </label>
                ) : (
                  <Link href={props.slotHref!(s)} className={`${ui.chip} w-full border-slate-300 bg-white hover:border-teal-600 hover:bg-teal-50`}>
                    {formatTime(s.startsAt)}
                  </Link>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
