// src/ports/notify.ts
export type EmailMessage = { to: string; subject: string; text: string };
export type SendResult = { ok: true; messageId: string } | { ok: false; error: string };
export interface Notifier { readonly name: string; sendEmail(m: EmailMessage): Promise<SendResult>; }
