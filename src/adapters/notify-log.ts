// src/adapters/notify-log.ts
import type { Notifier } from "@/ports/notify";
export const logNotifier: Notifier = {
  name: "log",
  async sendEmail(m) {
    console.info("[письмо:лог]", m.subject, "→", m.to.replace(/^(.).*(@.*)$/, "$1***$2"));
    return { ok: true, messageId: `log-${Date.now()}` };
  },
};
