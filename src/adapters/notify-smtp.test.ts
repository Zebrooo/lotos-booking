import { describe, it, expect } from "vitest";
import nodemailer from "nodemailer";
import { createSmtpNotifier } from "./notify-smtp";

describe("smtp notifier", () => {
  it("отправляет письмо с адресом отправителя, темой и текстом", async () => {
    const transport = nodemailer.createTransport({ jsonTransport: true });
    const sent: string[] = [];
    const n = createSmtpNotifier({
      from: "Лотос <zapis@example.ru>",
      transport: { sendMail: async m => { const r = await transport.sendMail(m); sent.push(String(r.message)); return r; } },
    });
    const r = await n.sendEmail({ to: "ivanov@example.com", subject: "Запись подтверждена", text: "Ждём вас" });
    expect(r.ok).toBe(true);
    const msg = JSON.parse(sent[0]!);
    expect(msg).toMatchObject({ subject: "Запись подтверждена", text: "Ждём вас" });
    expect(msg.to[0].address).toBe("ivanov@example.com");
    expect(msg.from.address).toBe("zapis@example.ru");
    expect(n.name).toBe("smtp");
  });

  it("сбой транспорта превращается в ошибку, а не в исключение", async () => {
    const n = createSmtpNotifier({ from: "a@b.c", transport: { sendMail: async () => { throw new Error("connection refused"); } } });
    expect(await n.sendEmail({ to: "x@y.z", subject: "s", text: "t" })).toEqual({ ok: false, error: "connection refused" });
  });
});
