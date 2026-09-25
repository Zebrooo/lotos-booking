export type SmsResult = { ok: true; messageId: string } | { ok: false; error: string };
export interface SmsSender {
  readonly name: string;
  send(phone: string, text: string): Promise<SmsResult>;
}
