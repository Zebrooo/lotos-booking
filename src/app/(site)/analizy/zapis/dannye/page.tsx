import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { app } from "@/lib/app";
import { availableLabSlots } from "@/lib/queries/lab-availability";
import { getLatestConsent } from "@/lib/queries/consents";
import { loadSettings } from "@/lib/usecases/settings";
import { reserveSettings } from "@/lib/usecases/start-booking";
import { UsecaseError } from "@/lib/usecases/errors";
import { reserveDeadline } from "@/domain/reserve";
import { localDay } from "@/domain/time";
import { first } from "@/lib/params";
import { dayLong, hhmmOf, plural, rub } from "@/lib/format";
import { labServicesQuery, parseLabServiceIds } from "@/lib/lab-pool";
import { readPrefill } from "@/lib/prefill";
import { Main, Stepper } from "@/components/site/stepper";
import { BookingForm } from "@/components/booking/booking-form";
import { startLabBookingAction } from "./actions";

export const metadata: Metadata = { title: "Данные пациента · Анализы · Лотос" };

export default async function LabPatientData(props: PageProps<"/analizy/zapis/dannye">) {
  const params = await props.searchParams;
  const ids = parseLabServiceIds(params.services);
  const startsAt = new Date(first(params.start) ?? "");
  if (ids.length === 0 || Number.isNaN(startsAt.getTime())) notFound();
  const { sql, adapters } = app();
  const now = adapters.clock.now();
  const today = localDay(now);
  const day = localDay(startsAt);
  const query = labServicesQuery(ids);
  const backHref = `/analizy/zapis?services=${query}&day=${day}`;
  const data = await Promise.all([
    loadSettings(sql), availableLabSlots(sql, adapters.clock, { serviceIds: ids, fromDay: day, days: 1 }),
    getLatestConsent(sql, "personal_data"), readPrefill(),
  ]).catch((error: unknown) => {
    if (error instanceof UsecaseError) return null;
    throw error;
  });
  if (!data) notFound();
  const [settings, availability, consent, prefill] = data;
    const free = availability.days[0]?.slots.some(slot => slot.startsAt.getTime() === startsAt.getTime()) ?? false;
    const deadline = reserveDeadline({ now, startsAt, settings: reserveSettings(settings) });
    const pool = availability.pool;
    return (
      <>
        <Stepper step={2} firstLabel="Анализы" />
        <Main>
          {!free || settings.onlineBookingPaused ? (
            <section style={{ display: "flex", flexDirection: "column", gap: 16, maxWidth: 560 }}>
              <h2 style={{ margin: 0, fontSize: "var(--h2-size)" }}>{settings.onlineBookingPaused ? "Онлайн-запись временно недоступна" : "Это время уже заняли"}</h2>
              <p style={{ margin: 0, fontSize: 15 }}>{settings.onlineBookingPaused ? "Позвоните в регистратуру — запишем по телефону." : "Выберите другое время — свободные окна обновились."}</p>
              <Link href={backHref} className="btn btn-primary" style={{ alignSelf: "flex-start", padding: "12px 16px" }}>К выбору времени →</Link>
            </section>
          ) : (
            <BookingForm backHref={backHref} today={today} prepayLabel={rub(pool.snapshot.prepayKopecks)} prep={pool.snapshot.prepNote ?? null}
              summary={[
                { k: "Место", v: pool.resourceTitle },
                { k: "Анализы", v: `${pool.items.length} ${plural(pool.items.length, "позиция", "позиции", "позиций")}` },
                { k: "Состав", v: pool.items.map(item => item.title).join(", ") },
                { k: "Когда", v: `${dayLong(day, today)}, ${hhmmOf(startsAt)}` },
                { k: "Стоимость", v: rub(pool.snapshot.priceKopecks) },
              ]}
              payModel={settings.payModel} deadlineLabel={deadline ? `${hhmmOf(deadline)} ${dayLong(localDay(deadline), today)}` : null}
              consentEdition={consent ? consent.publishedAt.toLocaleDateString("ru-RU", { timeZone: "Asia/Yekaterinburg" }) : "—"}
              initial={prefill} action={startLabBookingAction.bind(null, ids, startsAt.toISOString())}
            />
          )}
        </Main>
      </>
  );
}
