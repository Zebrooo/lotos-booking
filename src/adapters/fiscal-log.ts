// src/adapters/fiscal-log.ts
import type { Fiscalizer } from "@/ports/fiscal";
export const logFiscalizer: Fiscalizer = {
  name: "log",
  async send(r) {
    console.info("[чек:лог]", r.kind, r.amountKopecks, "→", r.email.replace(/^(.).*(@.*)$/, "$1***$2"));
    return { ok: true, externalId: `log-${Date.now()}` };
  },
};
