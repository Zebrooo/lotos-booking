// Деньги — журнал операций, не колонка-статус (12-design-v1.md, раздел 5).
// Состояние выводится из строк; строки только добавляются.
export const LEDGER_KINDS = ["advance", "settle", "refund", "retain", "transfer_out", "transfer_in"] as const;
export type LedgerKind = (typeof LEDGER_KINDS)[number];
export type LedgerRow = { kind: LedgerKind; amountKopecks: number };
export type MoneyState = "unpaid" | "advance_held" | "settled" | "refunded" | "retained" | "transferred_out" | "inconsistent";

const isInflow = (k: LedgerKind) => k === "advance" || k === "transfer_in";
const isDebit = (k: LedgerKind) => k === "settle" || k === "refund" || k === "transfer_out";
const validAmount = (n: number) => Number.isInteger(n) && n > 0;

/** Сколько денег пациента ещё лежит на записи. retain не списывает. */
export function balanceKopecks(rows: readonly LedgerRow[]): number {
  return rows.reduce((acc, r) => acc + (isInflow(r.kind) ? r.amountKopecks : isDebit(r.kind) ? -r.amountKopecks : 0), 0);
}

export function moneyState(rows: readonly LedgerRow[]): MoneyState {
  if (rows.length === 0) return "unpaid";
  if (rows.some(r => !validAmount(r.amountKopecks))) return "inconsistent";
  if (rows.filter(r => isInflow(r.kind)).length !== 1 || !isInflow(rows[0]!.kind)) return "inconsistent";
  if (balanceKopecks(rows) < 0) return "inconsistent";
  const last = rows.filter(r => !isInflow(r.kind)).at(-1);
  if (!last) return "advance_held";
  switch (last.kind) {
    case "settle": return "settled";
    case "refund": return "refunded";
    case "retain": return "retained";
    case "transfer_out": return "transferred_out";
    default: return "inconsistent";
  }
}

export function canAppend(rows: readonly LedgerRow[], row: LedgerRow): { ok: true } | { ok: false; reason: string } {
  if (!validAmount(row.amountKopecks)) return { ok: false, reason: "сумма — целые копейки больше нуля" };
  if (isInflow(row.kind)) {
    return rows.length === 0 ? { ok: true } : { ok: false, reason: "приход на запись уже есть" };
  }
  if (rows.length === 0 || !isInflow(rows[0]!.kind)) return { ok: false, reason: "нет прихода" };
  if (row.kind === "retain") {
    const untouched = rows.length === 1;
    return untouched ? { ok: true } : { ok: false, reason: "удержать можно только нетронутый аванс, один раз" };
  }
  if (row.amountKopecks > balanceKopecks(rows)) return { ok: false, reason: "сумма больше остатка на записи" };
  return { ok: true };
}
