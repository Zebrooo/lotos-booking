import { describe, expect, it } from "vitest";
import { createSmsruSms } from "./sms-smsru";

const options = { apiId: "secret", sender: "LOTOS_EMAN" };

describe("SMS.ru", () => {
  it("отправляет код по HTTPS без секрета в URL и возвращает id сообщения", async () => {
    let request: { url: string; init?: RequestInit } | undefined;
    const sms = createSmsruSms({ ...options, fetchImpl: async (url, init) => {
      request = { url: String(url), init };
      return new Response(JSON.stringify({ status: "OK", status_code: 100, sms: { "+79001234567": { status: "OK", status_code: 100, sms_id: "202647-1000000" } } }), { status: 200 });
    } });
    await expect(sms.send("+79001234567", "Код 2604")).resolves.toEqual({ ok: true, messageId: "202647-1000000" });
    expect(request!.url).toBe("https://sms.ru/sms/send");
    expect(request!.url).not.toContain("secret");
    expect(request!.init?.method).toBe("POST");
    const body = new URLSearchParams(String(request!.init?.body));
    expect(Object.fromEntries(body)).toEqual({ api_id: "secret", to: "+79001234567", msg: "Код 2604", from: "LOTOS_EMAN", json: "1" });
    expect(body.get("test")).toBeNull();
  });

  it("возвращает ошибку конкретного номера при общем успешном ответе", async () => {
    const sms = createSmsruSms({ ...options, fetchImpl: async () => new Response(JSON.stringify({ status: "OK", status_code: 100, sms: { "+79001234567": { status: "ERROR", status_code: 221 } } }), { status: 200 }) });
    expect(await sms.send("+79001234567", "Код")).toEqual({ ok: false, error: "SMS.ru: необходимо создать и согласовать буквенного отправителя" });
  });

  it("возвращает общий отказ сервиса", async () => {
    const sms = createSmsruSms({ ...options, fetchImpl: async () => new Response(JSON.stringify({ status: "ERROR", status_code: 302 }), { status: 200 }) });
    expect(await sms.send("+79001234567", "Код")).toEqual({ ok: false, error: "SMS.ru: аккаунт не подтверждён регистрационным кодом" });
  });

  it("не принимает успешный ответ без id как отправку", async () => {
    const sms = createSmsruSms({ ...options, fetchImpl: async () => new Response(JSON.stringify({ status: "OK", status_code: 100, sms: {} }), { status: 200 }) });
    expect(await sms.send("+79001234567", "Код")).toEqual({ ok: false, error: "SMS.ru: некорректный ответ сервиса" });
  });

  it("обрабатывает HTTP, сетевые ошибки и некорректный JSON", async () => {
    const http = createSmsruSms({ ...options, fetchImpl: async () => new Response("no", { status: 503 }) });
    expect(await http.send("+79001234567", "Код")).toEqual({ ok: false, error: "SMS.ru: HTTP 503" });
    const network = createSmsruSms({ ...options, fetchImpl: async () => { throw new Error("offline"); } });
    expect(await network.send("+79001234567", "Код")).toEqual({ ok: false, error: "SMS.ru: сетевая ошибка или некорректный ответ" });
    const invalid = createSmsruSms({ ...options, fetchImpl: async () => new Response("not json", { status: 200 }) });
    expect(await invalid.send("+79001234567", "Код")).toEqual({ ok: false, error: "SMS.ru: сетевая ошибка или некорректный ответ" });
  });
});
