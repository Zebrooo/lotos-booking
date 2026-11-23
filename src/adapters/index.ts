// src/adapters/index.ts
import type { PaymentProvider } from "@/ports/payment";
import type { Fiscalizer } from "@/ports/fiscal";
import type { Notifier } from "@/ports/notify";
import type { Clock } from "@/ports/clock";
import type { SmsSender } from "@/ports/sms";
import { createFakePaymentProvider } from "./payment-fake";
import { logFiscalizer } from "./fiscal-log";
import { logNotifier } from "./notify-log";
import { createSmtpNotifier } from "./notify-smtp";
import nodemailer from "nodemailer";
import { systemClock } from "./clock-system";
import { logSms } from "./sms-log";
import { createSmscSms } from "./sms-smsc";
import { createSmsruSms } from "./sms-smsru";
import { createUcallerSms } from "./sms-ucaller";

export type Adapters = { payment: PaymentProvider; fiscal: Fiscalizer; notify: Notifier; sms: SmsSender; clock: Clock };

function loadSms(env: Record<string, string | undefined>, name: string): SmsSender {
  if (name === "log") return logSms;
  if (name === "smsc") {
    if (!env.SMSC_API_KEY || !env.SMSC_SENDER) throw new Error("SMS_PROVIDER=smsc требует SMSC_API_KEY и SMSC_SENDER");
    return createSmscSms({ apiKey: env.SMSC_API_KEY, sender: env.SMSC_SENDER });
  }
  if (name === "smsru") {
    if (!env.SMSRU_API_ID || !env.SMSRU_SENDER) throw new Error("SMS_PROVIDER=smsru требует SMSRU_API_ID и SMSRU_SENDER");
    return createSmsruSms({ apiId: env.SMSRU_API_ID, sender: env.SMSRU_SENDER });
  }
  if (name === "ucaller") {
    if (!env.UCALLER_KEY || !env.UCALLER_SERVICE_ID) throw new Error("SMS_PROVIDER=ucaller требует UCALLER_KEY и UCALLER_SERVICE_ID");
    if (env.SMS_FALLBACK_PROVIDER !== "smsc" && env.SMS_FALLBACK_PROVIDER !== "smsru") {
      throw new Error("SMS_PROVIDER=ucaller требует SMS_FALLBACK_PROVIDER=smsc или smsru для обычных уведомлений");
    }
    return createUcallerSms({ key: env.UCALLER_KEY, serviceId: env.UCALLER_SERVICE_ID, client: env.UCALLER_CLIENT, fallback: loadSms(env, env.SMS_FALLBACK_PROVIDER) });
  }
  throw new Error(`Неизвестный SMS_PROVIDER: ${name}`);
}

export function loadAdapters(env: Record<string, string | undefined>): Adapters {
  const provider = env.PAYMENT_PROVIDER || "fake";
  if (env.NODE_ENV === "production" && provider === "fake" && env.ALLOW_DEMO_PAYMENTS !== "1") {
    throw new Error("PAYMENT_PROVIDER=fake запрещён в production без явного ALLOW_DEMO_PAYMENTS=1");
  }
  const smsName = env.SMS_PROVIDER || "log";
  if (env.NODE_ENV === "production" && smsName === "log") {
    throw new Error("SMS_PROVIDER=log запрещён в production: коды уходили бы в лог, а не пациентам");
  }
  const sms = loadSms(env, smsName);
  let payment: PaymentProvider;
  if (provider === "fake") {
    payment = createFakePaymentProvider({ baseUrl: env.SITE_URL || "http://localhost:3000", secret: env.FAKE_PAYMENT_SECRET || "dev-secret" });
  } else {
    throw new Error(`Неизвестный PAYMENT_PROVIDER: ${provider}`);
  }
  const fiscalName = env.FISCALIZER || "log";
  if (fiscalName !== "log") throw new Error(`Неизвестный FISCALIZER: ${fiscalName}`);
  const notifyName = env.NOTIFIER || "log";
  let notify: Notifier;
  if (notifyName === "log") {
    notify = logNotifier;
  } else if (notifyName === "smtp") {
    if (!env.SMTP_URL || !env.MAIL_FROM) throw new Error("NOTIFIER=smtp требует SMTP_URL и MAIL_FROM");
    notify = createSmtpNotifier({ transport: nodemailer.createTransport(env.SMTP_URL), from: env.MAIL_FROM });
  } else {
    throw new Error(`Неизвестный NOTIFIER: ${notifyName}`);
  }
  return { payment, fiscal: logFiscalizer, notify, sms, clock: systemClock };
}
