"use client";
// Страница врача — экран «isDoctor» прототипа: услуга, день (лента или
// календарь месяца), время и сводка «Ваша запись».
import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { CalendarDay } from "@/lib/queries/doctor-calendar";
import { rub, plural, dayLong, relName, wdShort, monShort, dateNum, shortName } from "@/lib/format";
import { hhmm, localTime } from "@/domain/time";
import { SummaryRows, asideStyle, kicker } from "./summary";

export type DoctorView = {
  id: number; fullName: string; surname: string; given: string; spec: string; exp: string | null;
  services: { id: number; name: string; durationMin: number; priceKopecks: number; prepayKopecks: number }[];
};
export type GroupInfo = { day: string; minPatients: number; have: number; decideLabel: string };

const acc = "var(--color-accent)";
const tx = "var(--color-text)";
const MONN = ["Январь", "Февраль", "Март", "Апрель", "Май", "Июнь", "Июль", "Август", "Сентябрь", "Октябрь", "Ноябрь", "Декабрь"];
const STRIP = 10;

export function DoctorBooking(props: {
  doctor: DoctorView; serviceId: number; today: string; openUntil: string | null; days: CalendarDay[];
  groups: GroupInfo[]; initialDay: string | null; reschedule: { token: string; action: (startIso: string) => Promise<void> } | null;
}) {
  const { doctor, days, today } = props;
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const svc = doctor.services.find(s => s.id === props.serviceId) ?? doctor.services[0]!;
  const idxOf = (day: string) => days.findIndex(d => d.day === day);
  const [dayI, setDayI] = useState(() => Math.max(0, props.initialDay ? idxOf(props.initialDay) : Math.min(1, days.length - 1)));
  const [slotT, setSlotT] = useState<number | null>(null);
  const [calOpen, setCalOpen] = useState(false);
  const [stripStart, setStripStart] = useState(() => Math.max(0, Math.min(dayI - 2, days.length - STRIP)));
  const firstMonth = Number(today.slice(0, 4)) * 12 + Number(today.slice(5, 7)) - 1;
  const lastDay = days.at(-1)?.day ?? today;
  const lastMonth = Number(lastDay.slice(0, 4)) * 12 + Number(lastDay.slice(5, 7)) - 1;
  const [calM, setCalM] = useState(0);

  const day = days[dayI];
  const group = props.groups.find(g => g.day === day?.day);
  const slots = day?.slots ?? [];
  const free = (d: CalendarDay) => d.slots.filter(s => s[1] === 0).length;
  const when = day && slotT != null ? `${dayLong(day.day, today)}, ${hhmm(slotT)}` : "—";
  const pickService = (id: number) => { if (id !== svc.id) router.replace(`/vrach/${doctor.id}?svc=${id}&day=${day?.day ?? ""}${props.reschedule ? `&perenos=${props.reschedule.token}` : ""}`, { scroll: false }); };
  const ss = Math.max(0, Math.min(stripStart, days.length - STRIP));
  const last = Math.max(0, days.length - STRIP);
  const toNext = () => {
    if (!day || slotT == null) return;
    const startIso = localTime(day.day, slotT).toISOString();
    if (props.reschedule) { const r = props.reschedule; startTransition(() => r.action(startIso)); return; }
    router.push(`/vrach/${doctor.id}/dannye?svc=${svc.id}&start=${encodeURIComponent(startIso)}`);
  };

  const calCells = useMemo(() => {
    const abs = firstMonth + calM, y = Math.floor(abs / 12), m = abs % 12;
    const off0 = (new Date(Date.UTC(y, m, 1)).getUTCDay() + 6) % 7;
    const dim = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
    const cells: ({ blank: true } | { blank: false; label: string; i: number; day: string })[] = [];
    for (let k = 0; k < off0; k++) cells.push({ blank: true });
    for (let d = 1; d <= dim; d++) {
      const iso = `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
      cells.push({ blank: false, label: String(d), i: idxOf(iso), day: iso });
    }
    return { cells, title: `${MONN[m]} ${y}` };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [calM, firstMonth, days]);

  return (
    <section style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <Link href={props.reschedule ? `/?perenos=${props.reschedule.token}` : "/"} className="plain-link" style={{ cursor: "pointer", fontSize: 14, color: "var(--color-accent-700)" }}>← Все врачи</Link>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 32, alignItems: "flex-start" }}>
        <div style={{ flex: "1 1 520px", minWidth: 0, display: "flex", flexDirection: "column", gap: 28 }}>
          <div style={{ display: "flex", gap: 20, alignItems: "flex-end", paddingBottom: 20, borderBottom: "1px solid var(--color-divider)" }}>
            <div style={{ width: 112, height: 136, flex: "none", background: "repeating-linear-gradient(135deg,var(--color-neutral-300) 0 2px,var(--color-neutral-200) 2px 8px)", display: "flex", alignItems: "flex-end", padding: 6, font: "10px ui-monospace,monospace", color: "var(--color-neutral-700)", borderRadius: 18 }}>фото врача, ч/б</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 4, minWidth: 0 }}>
              <span style={{ fontSize: 12, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--color-accent-700)" }}>{doctor.spec}</span>
              <h2 style={{ margin: 0, fontSize: "var(--h2-size)", letterSpacing: "-0.025em", lineHeight: 1.02 }}>{doctor.surname}</h2>
              <span style={{ fontSize: 16 }}>{doctor.given}</span>
              {doctor.exp && <span style={{ fontSize: 13, color: "var(--color-neutral-700)" }}>{doctor.exp}</span>}
            </div>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <span style={kicker}>1 — Услуга</span>
            <div style={{ display: "flex", flexDirection: "column", borderTop: "1px solid var(--color-neutral-300)" }}>
              {doctor.services.map(x => {
                const sel = x.id === svc.id;
                return (
                  <label key={x.id} onClick={() => pickService(x.id)} style={{ display: "grid", gridTemplateColumns: "20px minmax(0,1fr) auto", gap: 12, alignItems: "center", padding: "14px 0", borderBottom: "1px solid var(--color-divider)", cursor: "pointer" }}>
                    <span style={{ width: 16, height: 16, borderRadius: "50%", border: `1.5px solid ${sel ? acc : "var(--color-divider)"}`, background: sel ? acc : "transparent", boxShadow: "inset 0 0 0 4px var(--color-bg)" }} />
                    <span style={{ display: "flex", flexDirection: "column" }}><span style={{ fontWeight: 600, fontSize: 15 }}>{x.name}</span><span style={{ fontSize: 12, color: "var(--color-neutral-700)" }}>{x.durationMin} минут</span></span>
                    <span style={{ fontWeight: 800, fontSize: 16 }}>{rub(x.priceKopecks)}</span>
                  </label>
                );
              })}
            </div>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
              <span style={kicker}>2 — День</span>
              <button onClick={() => { setCalOpen(!calOpen); if (!calOpen && day) setCalM(Math.max(0, Number(day.day.slice(0, 4)) * 12 + Number(day.day.slice(5, 7)) - 1 - firstMonth)); }}
                style={{ font: "inherit", fontSize: 13, fontWeight: 700, border: 0, padding: "8px 14px", cursor: "pointer", display: "flex", alignItems: "center", gap: 8, background: calOpen ? tx : "var(--color-accent-100)", color: calOpen ? "#fff" : acc }}>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><rect x="3" y="5" width="18" height="16" rx="3" /><path d="M3 10h18M8 3v4M16 3v4" /></svg>
                {calOpen ? "Скрыть календарь" : "Весь календарь"}
              </button>
            </div>
            {!calOpen && (
              <div style={{ display: "flex", gap: 6, alignItems: "stretch" }}>
                <button onClick={() => setStripStart(Math.max(0, ss - 7))} disabled={ss === 0} aria-label="Раньше" style={{ flex: "none", width: 36, border: 0, background: "var(--color-surface)", color: tx, cursor: "pointer", fontSize: 18, fontWeight: 700, opacity: ss === 0 ? 0.35 : 1 }}>‹</button>
                <div style={{ display: "flex", gap: 6, overflowX: "auto", flex: 1, minWidth: 0, paddingBottom: 2 }}>
                  {days.slice(ss, ss + STRIP).map((d, k) => {
                    const i = ss + k, sel = i === dayI;
                    const sub = d.off ? "выходной" : d.group ? "группа" : relName(d.day, today) || monShort(d.day);
                    return (
                      <button key={d.day} onClick={() => { setDayI(i); setSlotT(null); }} disabled={d.off}
                        style={{ flex: "1 0 60px", font: "inherit", border: `1px solid ${sel ? acc : "var(--color-divider)"}`, borderRadius: 20, padding: "10px 8px", display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 2, cursor: "pointer", background: sel ? acc : "#fff", color: sel ? "#fff" : tx, opacity: d.off ? 0.4 : 1 }}>
                        <span style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.06em" }}>{wdShort(d.day)}</span>
                        <span style={{ fontWeight: 800, fontSize: 20, lineHeight: 1 }}>{Number(d.day.slice(8, 10))}</span>
                        <span style={{ fontSize: 11 }}>{sub}</span>
                      </button>
                    );
                  })}
                </div>
                <button onClick={() => setStripStart(Math.min(last, ss + 7))} disabled={ss >= last} aria-label="Позже" style={{ flex: "none", width: 36, border: 0, background: "var(--color-surface)", color: tx, cursor: "pointer", fontSize: 18, fontWeight: 700, opacity: ss >= last ? 0.35 : 1 }}>›</button>
              </div>
            )}
            {calOpen && (
              <div style={{ border: "1px solid var(--color-divider)", borderRadius: 28, padding: 20, display: "flex", flexDirection: "column", gap: 14, maxWidth: 460, background: "#fff", boxShadow: "var(--shadow-md)" }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                  <button onClick={() => setCalM(Math.max(0, calM - 1))} disabled={calM === 0} aria-label="Предыдущий месяц" style={{ width: 40, height: 40, border: 0, background: "var(--color-surface)", color: tx, cursor: "pointer", fontSize: 18, fontWeight: 700, opacity: calM === 0 ? 0.35 : 1 }}>‹</button>
                  <span style={{ fontWeight: 800, fontSize: 18 }}>{calCells.title}</span>
                  <button onClick={() => setCalM(Math.min(lastMonth - firstMonth, calM + 1))} disabled={calM >= lastMonth - firstMonth} aria-label="Следующий месяц" style={{ width: 40, height: 40, border: 0, background: "var(--color-surface)", color: tx, cursor: "pointer", fontSize: 18, fontWeight: 700, opacity: calM >= lastMonth - firstMonth ? 0.35 : 1 }}>›</button>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(7,minmax(0,1fr))", gap: 4, textAlign: "center", fontSize: 11, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--color-neutral-700)" }}>
                  <span>пн</span><span>вт</span><span>ср</span><span>чт</span><span>пт</span><span>сб</span><span>вс</span>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(7,minmax(0,1fr))", gap: 4 }}>
                  {calCells.cells.map((c, k) => {
                    const base: React.CSSProperties = { font: "inherit", height: 44, borderRadius: 14, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 3, padding: 0 };
                    if (c.blank) return <button key={`b${k}`} disabled style={{ ...base, border: "0", background: "transparent", color: "transparent", cursor: "default", visibility: "hidden" }}><span style={{ fontWeight: 400, fontSize: 15, lineHeight: 1 }} /><span style={{ width: 5, height: 5, borderRadius: "50%", background: "transparent" }} /></button>;
                    const d = c.i >= 0 ? days[c.i]! : null;
                    if (!d) return (
                      <button key={c.day} disabled title={c.day < today ? "Прошедшая дата" : "Запись на эту дату закрыта"} style={{ ...base, border: "1.5px solid transparent", background: "transparent", color: "var(--color-neutral-400)", cursor: "default" }}>
                        <span style={{ fontWeight: 400, fontSize: 15, lineHeight: 1 }}>{c.label}</span><span style={{ width: 5, height: 5, borderRadius: "50%", background: "transparent" }} />
                      </button>
                    );
                    const n = free(d), can = !d.off && n > 0, sel = c.i === dayI;
                    return (
                      <button key={c.day} disabled={!can} title={d.off ? "Выходной" : can ? `${n} ${plural(n, "свободное окно", "свободных окна", "свободных окон")}` : "Мест нет"}
                        onClick={() => { if (!can) return; setDayI(c.i); setSlotT(null); setCalOpen(false); setStripStart(Math.max(0, Math.min(c.i - 2, days.length - STRIP))); }}
                        style={{ ...base, border: c.i === 0 && !sel ? "1.5px solid var(--color-accent-300)" : "1.5px solid transparent", background: sel ? acc : can ? "var(--color-surface)" : "transparent", color: sel ? "#fff" : can ? tx : "var(--color-neutral-400)", cursor: can ? "pointer" : "default" }}>
                        <span style={{ fontWeight: can ? 700 : 400, fontSize: 15, lineHeight: 1, textDecoration: d.off ? "line-through" : "none" }}>{c.label}</span>
                        <span style={{ width: 5, height: 5, borderRadius: "50%", background: sel ? "#fff" : d.group ? "var(--color-success)" : can ? "var(--color-accent-2)" : "transparent" }} />
                      </button>
                    );
                  })}
                </div>
                <div style={{ display: "flex", gap: "6px 14px", flexWrap: "wrap", fontSize: 12, color: "var(--color-neutral-700)" }}>
                  <span style={{ display: "flex", alignItems: "center", gap: 6 }}><span style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--color-accent-2)" }} />есть свободное время</span>
                  <span style={{ display: "flex", alignItems: "center", gap: 6 }}><span style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--color-success)" }} />приём при наборе группы</span>
                  {props.openUntil && <span>Запись открыта до {dateNum(props.openUntil)}</span>}
                </div>
              </div>
            )}
          </div>

          {group && (
            <div style={{ border: "1px solid var(--color-neutral-300)", padding: 16, display: "grid", gridTemplateColumns: "minmax(0,1fr) auto", gap: 12, alignItems: "start", borderRadius: 24 }}>
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                <span style={{ fontWeight: 800, fontSize: 16 }}>Приём состоится при наборе группы</span>
                <span style={{ fontSize: 14, textWrap: "pretty" }}>Нужно минимум {group.minPatients} {plural(group.minPatients, "запись", "записи", "записей")}. Сейчас записано {group.have}. Решение — до {group.decideLabel}. Если приём не состоится, предоплата вернётся полностью или вы выберете другое время.</span>
              </div>
              <span style={{ fontWeight: 800, fontSize: 28, lineHeight: 1 }}>{group.have}/{group.minPatients}</span>
            </div>
          )}

          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <span style={kicker}>3 — Время · {day ? dayLong(day.day, today) : ""}</span>
            {slots.filter(s => s[1] === 0).length === 0 && <span style={{ fontSize: 14, color: "var(--color-neutral-700)", padding: "12px 0" }}>Свободного времени нет. Выберите другой день.</span>}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(84px,1fr))", gap: 6 }}>
              {slots.map(([t, taken]) => {
                const sel = t === slotT;
                return (
                  <button key={t} onClick={() => setSlotT(t)} disabled={taken === 1}
                    style={{ font: "inherit", fontSize: 15, fontWeight: 600, padding: "10px 12px", textAlign: "left", cursor: "pointer", border: `1px solid ${taken ? "var(--color-neutral-300)" : sel ? acc : "var(--color-divider)"}`, background: sel ? acc : taken ? "transparent" : "var(--color-bg)", color: sel ? "var(--color-bg)" : taken ? "var(--color-neutral-500)" : tx, textDecoration: taken ? "line-through" : "none" }}>{hhmm(t)}</button>
                );
              })}
            </div>
          </div>
        </div>

        <aside style={asideStyle}>
          <span style={kicker}>Ваша запись</span>
          <SummaryRows rows={[{ k: "Врач", v: shortName(doctor.fullName) }, { k: "Услуга", v: svc.name }, { k: "Когда", v: when }, { k: "Стоимость", v: rub(svc.priceKopecks) }]} />
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}><span style={{ fontSize: 14 }}>Предоплата сейчас</span><span style={{ fontWeight: 800, fontSize: 26 }}>{rub(svc.prepayKopecks)}</span></div>
          <span style={{ fontSize: 12, color: "var(--color-neutral-700)", textWrap: "pretty" }}>Остаток {rub(svc.priceKopecks - svc.prepayKopecks)} — в клинике в день приёма.</span>
          <button className="btn btn-primary" onClick={toNext} disabled={slotT == null || pending} style={{ padding: "14px 16px", fontSize: 15, justifyContent: "space-between" }}>
            {slotT == null ? "Выберите время" : props.reschedule ? "Перенести" : "Продолжить"}<span>→</span>
          </button>
        </aside>
      </div>
    </section>
  );
}
