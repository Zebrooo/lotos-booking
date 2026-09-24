import Link from "next/link";
import { notFound } from "next/navigation";
import { app } from "@/lib/app";
import { getServiceWithDoctors } from "@/lib/queries/catalog";
import { availableSlots } from "@/lib/queries/availability";
import { loadSettings } from "@/lib/usecases/settings";
import { localDay } from "@/domain/time";
import { ServiceSummary } from "@/components/service-summary";
import { SlotPicker } from "@/components/slot-picker";
import { ui, first, positiveInt } from "@/components/ui";

export default async function ChooseSlot(props: PageProps<"/zapis/[serviceId]">) {
  const serviceId = positiveInt((await props.params).serviceId);
  const sp = await props.searchParams;
  const { sql, adapters } = app();
  const service = serviceId ? await getServiceWithDoctors(sql, serviceId) : null;
  if (!service) notFound();

  const doctorId = positiveInt(first(sp.doctor));
  const doctor = service.doctors.find(d => d.id === doctorId) ?? (service.doctors.length === 1 ? service.doctors[0] : undefined);
  const settings = await loadSettings(sql);

  return (
    <div className="space-y-8">
      <Link href="/" className={`${ui.link} text-sm`}>← Все услуги</Link>
      <ServiceSummary service={service} />

      <section className="space-y-2">
        <h2 className={ui.h2}>Врач</h2>
        <ul className="grid gap-2 sm:grid-cols-2">
          {service.doctors.map(d => {
            const active = d.id === doctor?.id;
            return (
              <li key={d.id}>
                <Link href={`/zapis/${service.id}?doctor=${d.id}`} scroll={false} aria-current={active ? "true" : undefined}
                  className={`${ui.card} block p-4 ${active ? "border-teal-700 ring-2 ring-teal-700/20" : "hover:border-teal-600"}`}>
                  <span className="block font-medium">{d.title}</span>
                  <span className={ui.muted}>{d.specialty}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      </section>

      {settings.onlineBookingPaused ? (
        <p role="status" className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
          Онлайн-запись временно приостановлена. Записаться можно по телефону клиники.
        </p>
      ) : doctor ? (
        <Slots serviceId={service.id} doctorId={doctor.id} dayParam={first(sp.day)} horizonDays={settings.horizonDays} now={adapters.clock.now()} />
      ) : (
        <p className={ui.muted}>Выберите врача, чтобы увидеть свободное время.</p>
      )}
    </div>
  );
}

async function Slots(p: { serviceId: number; doctorId: number; dayParam: string | undefined; horizonDays: number; now: Date }) {
  const { sql, adapters } = app();
  const days = await availableSlots(sql, adapters.clock, { serviceId: p.serviceId, doctorId: p.doctorId, fromDay: localDay(p.now), days: p.horizonDays + 1 });
  const selectedDay = days.find(d => d.day === p.dayParam && d.slots.length > 0)?.day ?? days.find(d => d.slots.length > 0)?.day ?? null;
  const base = `/zapis/${p.serviceId}`;
  return (
    <SlotPicker
      days={days}
      selectedDay={selectedDay}
      dayHref={day => `${base}?doctor=${p.doctorId}&day=${day}`}
      slotHref={s => `${base}/dannye?doctor=${p.doctorId}&start=${encodeURIComponent(s.startsAt.toISOString())}`}
    />
  );
}
