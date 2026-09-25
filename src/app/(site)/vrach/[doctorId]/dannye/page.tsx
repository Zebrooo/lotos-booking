import Link from "next/link";
import { notFound } from "next/navigation";
import { app } from "@/lib/app";
import { getDoctorPage } from "@/lib/queries/doctors";
import { availableSlots } from "@/lib/queries/availability";
import { getLatestConsent } from "@/lib/queries/consents";
import { loadSettings } from "@/lib/usecases/settings";
import { reserveSettings } from "@/lib/usecases/start-booking";
import { reserveDeadline } from "@/domain/reserve";
import { localDay } from "@/domain/time";
import { first, positiveInt } from "@/lib/params";
import { rub, dayLong, hhmmOf, shortName } from "@/lib/format";
import { readPrefill } from "@/lib/prefill";
import { Stepper, Main } from "@/components/site/stepper";
import { BookingForm } from "@/components/booking/booking-form";
import { startBookingAction } from "./actions";

export default async function PatientData(props: PageProps<"/vrach/[doctorId]/dannye">) {
  const id = positiveInt((await props.params).doctorId);
  const sp = await props.searchParams;
  const { sql, adapters } = app();
  const now = adapters.clock.now();
  const doctor = id ? await getDoctorPage(sql, adapters.clock, id) : null;
  const svc = doctor?.services.find(s => s.id === positiveInt(sp.svc));
  const startsAt = new Date(first(sp.start) ?? "");
  if (!doctor || !svc || Number.isNaN(startsAt.getTime())) notFound();

  const today = localDay(now);
  const day = localDay(startsAt);
  const backHref = `/vrach/${doctor.id}?svc=${svc.id}&day=${day}`;
  const [settings, [slotsDay], consent, prefill] = await Promise.all([
    loadSettings(sql), availableSlots(sql, adapters.clock, { serviceId: svc.id, doctorId: doctor.id, fromDay: day, days: 1 }),
    getLatestConsent(sql, "personal_data"), readPrefill(),
  ]);
  const free = slotsDay?.slots.some(s => s.startsAt.getTime() === startsAt.getTime()) ?? false;
  const deadline = reserveDeadline({ now, startsAt, settings: reserveSettings(settings) });

  return (
    <>
      <Stepper step={2} />
      <Main>
        {!free || settings.onlineBookingPaused ? (
          <section style={{ display: "flex", flexDirection: "column", gap: 16, maxWidth: 560 }}>
            <h2 style={{ margin: 0, fontSize: "var(--h2-size)", letterSpacing: "-0.025em" }}>{settings.onlineBookingPaused ? "Онлайн-запись временно недоступна" : "Это время уже заняли"}</h2>
            <p style={{ margin: 0, fontSize: 15 }}>{settings.onlineBookingPaused ? "Позвоните в регистратуру — запишем по телефону." : "Выберите другое время — свободные окна обновились."}</p>
            <Link href={backHref} className="btn btn-primary" style={{ alignSelf: "flex-start", padding: "12px 16px" }}>К выбору времени →</Link>
          </section>
        ) : (
          <BookingForm
            backHref={backHref} today={today} prepayLabel={rub(svc.prepayKopecks)} prep={svc.prepNote}
            summary={[{ k: "Врач", v: shortName(doctor.fullName) }, { k: "Услуга", v: svc.name }, { k: "Когда", v: `${dayLong(day, today)}, ${hhmmOf(startsAt)}` }, { k: "Стоимость", v: rub(svc.priceKopecks) }]}
            payModel={settings.payModel} deadlineLabel={deadline ? `${hhmmOf(deadline)} ${dayLong(localDay(deadline), today)}` : null}
            consentEdition={consent ? consent.publishedAt.toLocaleDateString("ru-RU", { timeZone: "Asia/Yekaterinburg" }) : "—"}
            initial={prefill} action={startBookingAction.bind(null, svc.id, doctor.id, startsAt.toISOString())}
          />
        )}
      </Main>
    </>
  );
}
