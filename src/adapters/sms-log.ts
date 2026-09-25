// СМС в лог сервера — только для разработки. Номер маскируется, текст виден:
// в нём код подтверждения, без которого локально не пройти запись.
import type { SmsSender } from "@/ports/sms";
export const logSms: SmsSender = {
  name: "log",
  async send(phone, text) {
    console.info(`[смс:лог] ${phone.slice(0, 5)}***${phone.slice(-2)}: ${text}`);
    return { ok: true, messageId: `log-${Date.now()}` };
  },
};
