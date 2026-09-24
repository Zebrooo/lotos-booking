// src/adapters/index.ts
import type { PaymentProvider } from "@/ports/payment";
import type { Fiscalizer } from "@/ports/fiscal";
import type { Notifier } from "@/ports/notify";
import type { Clock } from "@/ports/clock";
import { createFakePaymentProvider } from "./payment-fake";
import { logFiscalizer } from "./fiscal-log";
import { logNotifier } from "./notify-log";
import { createSmtpNotifier } from "./notify-smtp";
import nodemailer from "nodemailer";
import { systemClock } from "./clock-system";

export type Adapters = { payment: PaymentProvider; fiscal: Fiscalizer; notify: Notifier; clock: Clock };

export function loadAdapters(env: Record<string, string | undefined>): Adapters {
  const provider = env.PAYMENT_PROVIDER ?? "fake";
  if (env.NODE_ENV === "production" && provider === "fake") {
    throw new Error("PAYMENT_PROVIDER=fake запрещён в production");
  }
  let payment: PaymentProvider;
  if (provider === "fake") {
    payment = createFakePaymentProvider({ baseUrl: env.SITE_URL ?? "http://localhost:3000", secret: env.FAKE_PAYMENT_SECRET ?? "dev-secret" });
  } else {
    throw new Error(`Неизвестный PAYMENT_PROVIDER: ${provider}`);
  }
  const fiscalName = env.FISCALIZER ?? "log";
  if (fiscalName !== "log") throw new Error(`Неизвестный FISCALIZER: ${fiscalName}`);
  const notifyName = env.NOTIFIER ?? "log";
  let notify: Notifier;
  if (notifyName === "log") {
    notify = logNotifier;
  } else if (notifyName === "smtp") {
    if (!env.SMTP_URL || !env.MAIL_FROM) throw new Error("NOTIFIER=smtp требует SMTP_URL и MAIL_FROM");
    notify = createSmtpNotifier({ transport: nodemailer.createTransport(env.SMTP_URL), from: env.MAIL_FROM });
  } else {
    throw new Error(`Неизвестный NOTIFIER: ${notifyName}`);
  }
  return { payment, fiscal: logFiscalizer, notify, clock: systemClock };
}
