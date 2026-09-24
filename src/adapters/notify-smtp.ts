// Почта через SMTP. Транспорт передаётся снаружи: в бою — nodemailer по
// SMTP_URL, в тестах — jsonTransport. Сбой отправки не бросается, а
// возвращается: фоновый проход запишет попытку и повторит позже.
import type { Notifier } from "@/ports/notify";

export type MailTransport = {
  sendMail(m: { from: string; to: string; subject: string; text: string }): Promise<{ messageId?: string }>;
};

export function createSmtpNotifier(o: { transport: MailTransport; from: string }): Notifier {
  return {
    name: "smtp",
    async sendEmail(m) {
      try {
        const r = await o.transport.sendMail({ from: o.from, to: m.to, subject: m.subject, text: m.text });
        return { ok: true, messageId: r.messageId ?? "" };
      } catch (e) {
        return { ok: false, error: e instanceof Error ? e.message : String(e) };
      }
    },
  };
}
