import { notFound } from "next/navigation";
import { app } from "@/lib/app";
import { getDoctorPage } from "@/lib/queries/doctors";
import { doctorCalendar } from "@/lib/queries/doctor-calendar";
import { getBookingView } from "@/lib/queries/booking-view";
import { first, positiveInt, token } from "@/lib/params";
import { localDay } from "@/domain/time";
import { wdShort, dateNum, hhmmOf } from "@/lib/format";
import { Stepper, Main } from "@/components/site/stepper";
import { DoctorBooking } from "@/components/booking/doctor-booking";
import { rescheduleAction } from "./actions";

export default async function DoctorPage(props: PageProps<"/vrach/[doctorId]">) {
  const id = positiveInt((await props.params).doctorId);
  const sp = await props.searchParams;
  const { sql, adapters } = app();
  const doctor = id ? await getDoctorPage(sql, adapters.clock, id) : null;
  if (!doctor) notFound();

  let serviceId = doctor.services.find(s => s.id === positiveInt(sp.svc))?.id ?? doctor.services[0]!.id;
  let reschedule: { token: string; action: (startIso: string) => Promise<void> } | null = null;
  const perenos = token(sp.perenos);
  if (perenos) {
    const view = await getBookingView(sql, adapters.clock, perenos);
    if (view?.canTransfer && doctor.services.some(s => s.id === view.serviceId)) {
      serviceId = view.serviceId;
      reschedule = { token: perenos, action: rescheduleAction.bind(null, perenos, doctor.id) };
    }
  }
  const cal = await doctorCalendar(sql, adapters.clock, { doctorId: doctor.id, serviceId });
  const groups = doctor.groupDays.map(g => ({
    day: g.day, minPatients: g.minPatients, have: g.have,
    decideLabel: `${wdShort(localDay(g.decideAt))}, ${dateNum(localDay(g.decideAt))}, ${hhmmOf(g.decideAt)}`,
  }));
  const dayParam = first(sp.day);
  const initialDay = cal.days.some(d => d.day === dayParam) ? dayParam! : groups[0]?.day ?? null;

  return (
    <>
      <Stepper step={1} />
      <Main>
        <DoctorBooking
          key={`${doctor.id}:${serviceId}`}
          doctor={{ id: doctor.id, fullName: doctor.fullName, surname: doctor.surname, given: doctor.given, spec: doctor.spec, exp: doctor.exp,
            services: doctor.services.map(s => ({ id: s.id, name: s.name, durationMin: s.durationMin, priceKopecks: s.priceKopecks, prepayKopecks: s.prepayKopecks })) }}
          serviceId={serviceId} today={cal.today} openUntil={cal.openUntil} days={cal.days} groups={groups}
          initialDay={initialDay} reschedule={reschedule}
        />
      </Main>
    </>
  );
}
