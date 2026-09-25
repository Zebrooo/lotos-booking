import { app } from "@/lib/app";
import { listDoctorCards } from "@/lib/queries/doctors";
import { Main } from "@/components/site/stepper";
import { DoctorSearch } from "@/components/booking/search";

export default async function Home(props: PageProps<"/">) {
  const perenos = (await props.searchParams).perenos;
  const { sql, adapters } = app();
  const cards = await listDoctorCards(sql, adapters.clock);
  const doctors = cards.map(c => ({ id: c.id, surname: c.surname, given: c.given, spec: c.spec, hasGroup: c.hasGroup, nearest: c.nearest,
    services: c.services.map(s => ({ name: s.name, priceKopecks: s.priceKopecks })) }));
  return (
    <Main>
      <DoctorSearch doctors={doctors} reschedule={typeof perenos === "string" && /^[A-Za-z0-9_-]{21}$/.test(perenos) ? perenos : null} />
    </Main>
  );
}
