import { describe, expect, it } from "vitest";
import type { SmsSender } from "@/ports/sms";
import { createUcallerSms, otpFromText } from "./sms-ucaller";

const options = { key: "secret", serviceId: "service", client: "lotos-zapis.ru" };

describe("uCaller", () => {
  it("извлекает коды из сообщений записи и входа, но не из уведомлений", () => {
    expect(otpFromText("Лотос: код 0040. Запись и оплата: https://lotos-zapis.ru/zapis/1")).toBe("0040");
    expect(otpFromText("Лотос: код для входа в личный кабинет — 2604. Никому его не сообщайте.")).toBe("2604");
    expect(otpFromText("Лотос: запись подтверждена — 25 ноября в 10:30")).toBeNull();
  });

  it("передаёт код в звонок и возвращает id вызова", async () => {
    let requested = "";
    const sms = createUcallerSms({ ...options, fetchImpl: async url => {
      requested = String(url);
      return new Response(JSON.stringify({ status: true, ucaller_id: 123456 }), { status: 200 });
    } });
    await expect(sms.send("+79193571547", "Лотос: код 0040. Запись и оплата: https://lotos-zapis.ru/zapis/1")).resolves.toEqual({ ok: true, messageId: "123456" });
    const url = new URL(requested);
    expect(url.origin + url.pathname).toBe("https://api.ucaller.ru/v1.0/initCall");
    expect(url.searchParams.get("key")).toBe("secret");
    expect(url.searchParams.get("service_id")).toBe("service");
    expect(url.searchParams.get("phone")).toBe("79193571547");
    expect(url.searchParams.get("code")).toBe("0040");
    expect(url.searchParams.get("client")).toBe("lotos-zapis.ru");
  });

  it("делегирует обычные уведомления резервному провайдеру", async () => {
    let called = false;
    const fallback: SmsSender = { name: "smsc", send: async () => { called = true; return { ok: true, messageId: "sms-1" }; } };
    const sms = createUcallerSms({ ...options, fallback, fetchImpl: async () => { throw new Error("uCaller не должен вызываться"); } });
    expect(await sms.send("+79193571547", "Лотос: запись подтверждена — 25 ноября в 10:30")).toEqual({ ok: true, messageId: "sms-1" });
    expect(called).toBe(true);
  });

  it("возвращает отказ провайдера без повторной отправки", async () => {
    const sms = createUcallerSms({ ...options, fetchImpl: async () => new Response(JSON.stringify({ status: false, error: "bad key" }), { status: 200 }) });
    expect(await sms.send("+79193571547", "Лотос: код 0040")).toEqual({ ok: false, error: "uCaller: bad key" });
  });

  it("обрабатывает HTTP и сетевые ошибки", async () => {
    const http = createUcallerSms({ ...options, fetchImpl: async () => new Response("no", { status: 503 }) });
    expect(await http.send("+79193571547", "Лотос: код 0040")).toEqual({ ok: false, error: "uCaller: HTTP 503" });
    const network = createUcallerSms({ ...options, fetchImpl: async () => { throw new Error("offline"); } });
    expect(await network.send("+79193571547", "Лотос: код 0040")).toEqual({ ok: false, error: "uCaller: сетевая ошибка или некорректный ответ" });
  });
});
