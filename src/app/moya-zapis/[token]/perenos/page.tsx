import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { app } from "@/lib/app";
import { getBookingView } from "@/lib/queries/booking-view";
import { getServiceWithDoctors } from "@/lib/queries/catalog";
import { availableSlots } from "@/lib/queries/availability";
import { loadSettings } from "@/lib/usecases/settings";
import { localDay } from "@/domain/time";
import { formatDateTime } from "@/lib/texts";
import { SlotPicker } from "@/components/slot-picker";
import { ui, first, positiveInt } from "@/components/ui";
import { transferAction } from "../actions";
import { TransferForm } from "./form";

export default async function Transfer(props: PageProps<"/moya-zapis/[token]/perenos">) {
  const { token } = await props.params;
  const sp = await props.searchParams;
  const { sql, adapters } = app();
  const v = await getBookingView(sql, adapters.clock, token);
  if (!v) notFound();
  if (!v.canTransfer) redirect(`/moya-zapis/${token}`);
  const service = await getServiceWithDoctors(sql, v.serviceId);
  if (!service) redirect(`/moya-zapis/${token}`);

  const doctor = service.doctors.find(d => d.id === positiveInt(first(sp.doctor))) ?? service.doctors.find(d => d.id === v.doctorId) ?? service.doctors[0]!;
  const settings = await loadSettings(sql);
  const days = await availableSlots(sql, adapters.clock, { serviceId: service.id, doctorId: doctor.id, fromDay: localDay(adapters.clock.now()), days: settings.horizonDays + 1 });
  const dayParam = first(sp.day);
  const selectedDay = days.find(d => d.day === dayParam && d.slots.length > 0)?.day ?? days.find(d => d.slots.length > 0)?.day ?? null;
  const base = `/moya-zapis/${token}/perenos`;

  return (
    <div className="space-y-6">
      <Link href={`/moya-zapis/${token}`} className={`${ui.link} text-sm`}>← К записи</Link>
      <h1 className={ui.h1}>Перенос записи</h1>
      <p className="text-slate-600">{service.title}, сейчас: {formatDateTime(v.startsAt)}. Предоплата перейдёт на новое время, платить заново не нужно.</p>

      {service.doctors.length > 1 && (
        <div className="flex flex-wrap gap-2">
          {service.doctors.map(d => (
            <Link key={d.id} href={`${base}?doctor=${d.id}`} scroll={false}
              className={`${ui.chip} ${d.id === doctor.id ? "border-teal-700 bg-teal-700 text-white" : "border-slate-300 bg-white"}`}>{d.title}</Link>
          ))}
        </div>
      )}

      <TransferForm action={transferAction.bind(null, token)} doctorId={doctor.id}>
        <SlotPicker days={days} selectedDay={selectedDay} dayHref={day => `${base}?doctor=${doctor.id}&day=${day}`} radioName="start" />
      </TransferForm>
    </div>
  );
}
