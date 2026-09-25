import { notFound, redirect } from "next/navigation";
import { app } from "@/lib/app";
import { codeStep } from "@/lib/usecases/code-step";
import { Stepper, Main } from "@/components/site/stepper";
import { CodeForm } from "@/components/booking/code-form";
import { confirmCodeAction, resendCodeAction, changeNumberAction } from "./actions";

export default async function CodePage(props: PageProps<"/zapis/[token]/kod">) {
  const { token } = await props.params;
  const { sql, adapters } = app();
  const step = await codeStep(sql, adapters.clock, token);
  if (!step) notFound();
  if (step.verified || step.status !== "held") redirect(`/zapis/${token}`);
  return (
    <>
      <Stepper step={3} />
      <Main>
        <section style={{ maxWidth: 560, display: "flex", flexDirection: "column", gap: 24 }}>
          <CodeForm phone={step.phoneMasked} cta={step.payMode === "online" ? "Перейти к оплате" : "Забронировать"}
            resendAt={step.resendAt.toISOString()} devHint={adapters.sms.name === "log"}
            confirm={confirmCodeAction.bind(null, token)} resend={resendCodeAction.bind(null, token)} changeNumber={changeNumberAction.bind(null, token)} />
        </section>
      </Main>
    </>
  );
}
