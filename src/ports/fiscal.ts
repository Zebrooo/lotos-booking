// src/ports/fiscal.ts
// Чек уходит покупателю на телефон (СМС от ОФД) и/или на почту.
export type ReceiptRequest = { kind: "advance" | "settle" | "refund"; amountKopecks: number; phone: string | null; email: string | null; description: string; bookingId: number };
export type ReceiptResult = { ok: true; externalId: string } | { ok: false; error: string };
export interface Fiscalizer { readonly name: string; send(r: ReceiptRequest): Promise<ReceiptResult>; }
