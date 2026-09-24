import Link from "next/link";
import { notFound } from "next/navigation";
import { app } from "@/lib/app";
import { getServiceWithDoctors } from "@/lib/queries/catalog";
import { availableSlots } from "@/lib/queries/availability";
import { loadSettings } from "@/lib/usecases/settings";
import { localDay } from "@/domain/time";
import { formatDateTime, formatRub, prepayTermsText } from "@/lib/texts";
import { ServiceSummary } from "@/components/service-summary";
import { ArrivalNotice } from "@/components/arrival-notice";
import { ui, first, positiveInt } from "@/components/ui";
import { BookingForm } from "./form";
import { bookAction } from "./actions";

export default async function PatientData(props: PageProps<"/zapis/[serviceId]/dannye">) {
  const serviceId = positiveInt((await props.params).serviceId);
  const sp = await props.searchParams;
  const { sql, adapters } = app();
  const service = serviceId ? await getServiceWithDoctors(sql, serviceId) : null;
  if (!service) notFound();
  const doctor = service.doctors.find(d => d.id === positiveInt(first(sp.doctor)));
  const startsAt = new Date(first(sp.start) ?? "");
  if (!doctor || Number.isNaN(startsAt.getTime())) notFound();

  const settings = await loadSettings(sql);
  const [day] = await availableSlots(sql, adapters.clock, { serviceId: service.id, doctorId: doctor.id, fromDay: localDay(startsAt), days: 1 });
  const stillFree = day?.slots.some(s => s.startsAt.getTime() === startsAt.getTime()) ?? false;
  const back = `/zapis/${service.id}?doctor=${doctor.id}&day=${localDay(startsAt)}`;

  return (
    <div className="space-y-6">
      <Link href={back} className={`${ui.link} text-sm`}>← Выбрать другое время</Link>
      <ServiceSummary service={service} />
      <div className={`${ui.card} grid gap-1 sm:grid-cols-2`}>
        <div><span className={ui.muted}>Врач</span><div className="font-medium">{doctor.title}</div></div>
        <div><span className={ui.muted}>Время</span><div className="font-medium">{formatDateTime(startsAt)}</div></div>
      </div>

      {!stillFree || settings.onlineBookingPaused ? (
        <p role="alert" className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-amber-900">
          {settings.onlineBookingPaused ? "Онлайн-запись временно приостановлена. Записаться можно по телефону клиники." : "Это время уже недоступно."}{" "}
          <Link className={ui.link} href={back}>Выбрать другое</Link>
        </p>
      ) : (
        <>
          <ArrivalNotice minutes={settings.arriveEarlyMinutes} />
          <BookingForm
            action={bookAction.bind(null, service.id, doctor.id, startsAt.toISOString())}
            prepayLabel={formatRub(service.prepayKopecks)}
            prepayTerms={prepayTermsText({ prepayKopecks: service.prepayKopecks, freeCancelHours: settings.freeCancelHours, coolingOffMinutes: settings.coolingOffMinutes })}
          />
        </>
      )}
    </div>
  );
}
