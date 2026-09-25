// Личный кабинет пациента: без сессии — вход по СМС, с сессией — всё по семье.
import type { Metadata } from "next";
import { app } from "@/lib/app";
import { Main } from "@/components/site/stepper";
import { currentPhone } from "@/lib/cabinet/session-view";
import { cabinetData } from "@/lib/cabinet/data";
import { cabinetViewModel } from "@/lib/cabinet/view-model";
import { CabinetLogin } from "@/components/cabinet/login";
import { Cabinet } from "@/components/cabinet/cabinet";

export const metadata: Metadata = { title: "Личный кабинет · Лотос" };

export default async function CabinetPage() {
  const phone = await currentPhone();
  const { sql, adapters, config } = app();
  const data = phone ? await cabinetData(sql, adapters.clock, phone) : null;
  return (
    <Main>
      {data
        ? <Cabinet vm={cabinetViewModel(data, adapters.clock.now(), { address: config.clinic.address })} ownerId={data.owner.id} />
        : <section style={{ display: "flex", flexDirection: "column", gap: 24 }}><CabinetLogin /></section>}
    </Main>
  );
}
