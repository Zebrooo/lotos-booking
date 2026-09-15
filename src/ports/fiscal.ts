// src/ports/fiscal.ts
export type ReceiptRequest = { kind: "advance" | "settle" | "refund"; amountKopecks: number; email: string; description: string; bookingId: number };
export type ReceiptResult = { ok: true; externalId: string } | { ok: false; error: string };
export interface Fiscalizer { readonly name: string; send(r: ReceiptRequest): Promise<ReceiptResult>; }
