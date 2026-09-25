// src/adapters/fiscal-log.ts
import type { Fiscalizer } from "@/ports/fiscal";

const mask = (r: { phone: string | null; email: string | null }) =>
  [r.phone?.replace(/^(\+7\d{3})\d+(\d{2})$/, "$1***$2"), r.email?.replace(/^(.).*(@.*)$/, "$1***$2")].filter(Boolean).join(", ");

export const logFiscalizer: Fiscalizer = {
  name: "log",
  async send(r) {
    console.info("[чек:лог]", r.kind, r.amountKopecks, "→", mask(r));
    return { ok: true, externalId: `log-${Date.now()}` };
  },
};
