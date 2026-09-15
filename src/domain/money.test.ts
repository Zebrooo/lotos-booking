import { describe, it, expect } from "vitest";
import { moneyState, balanceKopecks, canAppend, type LedgerRow } from "./money";

const adv: LedgerRow = { kind: "advance", amountKopecks: 40000 };

describe("moneyState", () => {
  it.each<[LedgerRow[], string]>([
    [[], "unpaid"],
    [[adv], "advance_held"],
    [[adv, { kind: "settle", amountKopecks: 40000 }], "settled"],
    [[adv, { kind: "refund", amountKopecks: 40000 }], "refunded"],
    [[adv, { kind: "retain", amountKopecks: 40000 }], "retained"],
    [[adv, { kind: "transfer_out", amountKopecks: 40000 }], "transferred_out"],
    [[{ kind: "transfer_in", amountKopecks: 40000 }], "advance_held"],
    [[adv, { kind: "retain", amountKopecks: 40000 }, { kind: "refund", amountKopecks: 40000 }], "refunded"],
    [[adv, { kind: "refund", amountKopecks: 50000 }], "inconsistent"],
    [[{ kind: "refund", amountKopecks: 40000 }], "inconsistent"],
  ])("%j → %s", (rows, expected) => {
    expect(moneyState(rows)).toBe(expected);
  });
});

describe("balanceKopecks", () => {
  it("retain баланс не списывает, refund списывает", () => {
    expect(balanceKopecks([adv, { kind: "retain", amountKopecks: 40000 }])).toBe(40000);
    expect(balanceKopecks([adv, { kind: "refund", amountKopecks: 40000 }])).toBe(0);
  });
});

describe("canAppend", () => {
  it("второй аванс запрещён", () => {
    expect(canAppend([adv], adv).ok).toBe(false);
  });
  it("возврат больше баланса запрещён", () => {
    expect(canAppend([adv], { kind: "refund", amountKopecks: 40001 }).ok).toBe(false);
    expect(canAppend([adv], { kind: "refund", amountKopecks: 40000 }).ok).toBe(true);
  });
  it("удержание только при нетронутом авансе и один раз", () => {
    expect(canAppend([adv], { kind: "retain", amountKopecks: 40000 }).ok).toBe(true);
    expect(canAppend([adv, { kind: "retain", amountKopecks: 40000 }], { kind: "retain", amountKopecks: 40000 }).ok).toBe(false);
    expect(canAppend([adv, { kind: "refund", amountKopecks: 40000 }], { kind: "retain", amountKopecks: 40000 }).ok).toBe(false);
  });
  it("сумма — целые копейки больше нуля", () => {
    expect(canAppend([], { kind: "advance", amountKopecks: 0 }).ok).toBe(false);
    expect(canAppend([], { kind: "advance", amountKopecks: 400.5 }).ok).toBe(false);
  });
});
