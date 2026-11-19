import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { app } from "@/lib/app";
import { labCalendar } from "@/lib/queries/lab-availability";
import { parseLabServiceIds } from "@/lib/lab-pool";
import { UsecaseError } from "@/lib/usecases/errors";
import { Main, Stepper } from "@/components/site/stepper";
import { LabBooking } from "@/components/booking/lab-booking";

export const metadata: Metadata = { title: "Запись на анализы · Лотос" };

export default async function LabBookingPage(props: PageProps<"/analizy/zapis">) {
  const params = await props.searchParams;
  const ids = parseLabServiceIds(params.services);
  if (ids.length === 0) redirect("/analizy");
  const { sql, adapters } = app();
  let calendar: Awaited<ReturnType<typeof labCalendar>>;
  try {
    calendar = await labCalendar(sql, adapters.clock, ids);
  } catch (error) {
    if (error instanceof UsecaseError) notFound();
    throw error;
  }
  const requestedDay = typeof params.day === "string" ? params.day : null;
  const initialDay = calendar.days.some(day => day.day === requestedDay && day.slots.length > 0)
    ? requestedDay : calendar.days.find(day => day.slots.length > 0)?.day ?? null;
  return (
    <>
      <Stepper step={1} firstLabel="Анализы" />
      <Main>
        <LabBooking key={ids.join(",")} items={calendar.pool.items} resourceTitle={calendar.pool.resourceTitle}
          today={calendar.today} days={calendar.days} initialDay={initialDay} />
      </Main>
    </>
  );
}
