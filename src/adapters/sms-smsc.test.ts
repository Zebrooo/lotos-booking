import { describe, expect, it } from "vitest";
import { createSmscSms } from "./sms-smsc";

const options = { apiKey: "secret", sender: "LOTOS" };

describe("SMSC", () => {
  it("отправляет код по HTTPS без секрета в URL и возвращает id сообщения", async () => {
    let request: { url: string; init?: RequestInit } | undefined;
    const sms = createSmscSms({ ...options, fetchImpl: async (url, init) => {
      request = { url: String(url), init };
      return new Response(JSON.stringify({ id: 123456, cnt: 1 }), { status: 200 });
    } });
    await expect(sms.send("+79001234567", "Код 2604")).resolves.toEqual({ ok: true, messageId: "123456" });
    expect(request!.url).toBe("https://smsc.ru/rest/send/");
    expect(request!.url).not.toContain("secret");
    expect(request!.init?.method).toBe("POST");
    expect(JSON.parse(String(request!.init?.body))).toMatchObject({ apikey: "secret", phones: "+79001234567", mes: "Код 2604", sender: "LOTOS", fmt: 3 });
  });

  it("различает запрещённый IP и неверный ключ", async () => {
    const sms = createSmscSms({ ...options, fetchImpl: async () => new Response(JSON.stringify({ error: "denied", error_code: 2 }), { status: 200 }) });
    const result = await sms.send("+79001234567", "Код");
    expect(result).toMatchObject({ ok: false });
    if (!result.ok) expect(result.error).toContain("IP-адрес");
  });

  it("возвращает ошибку провайдера без повторной мнимой отправки", async () => {
    const sms = createSmscSms({ ...options, fetchImpl: async () => new Response(JSON.stringify({ error: "no money", error_code: 3, id: 10 }), { status: 200 }) });
    expect(await sms.send("+79001234567", "Код")).toEqual({ ok: false, error: "SMSC: недостаточно средств или ошибка в параметрах сообщения" });
  });

  it("не принимает ответ без id как успешную отправку", async () => {
    const sms = createSmscSms({ ...options, fetchImpl: async () => new Response(JSON.stringify({ cnt: 1 }), { status: 200 }) });
    expect(await sms.send("+79001234567", "Код")).toEqual({ ok: false, error: "SMSC: некорректный ответ без идентификатора сообщения" });
  });

  it("обрабатывает HTTP и сетевые ошибки", async () => {
    const http = createSmscSms({ ...options, fetchImpl: async () => new Response("no", { status: 503 }) });
    expect(await http.send("+79001234567", "Код")).toEqual({ ok: false, error: "SMSC: HTTP 503" });
    const network = createSmscSms({ ...options, fetchImpl: async () => { throw new Error("offline"); } });
    expect(await network.send("+79001234567", "Код")).toEqual({ ok: false, error: "SMSC: сетевая ошибка или некорректный ответ" });
  });
});
