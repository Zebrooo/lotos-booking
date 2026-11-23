import type { SmsSender, SmsResult } from "@/ports/sms";

type UcallerOptions = {
  key: string;
  serviceId: string;
  client?: string;
  fallback?: SmsSender;
  apiUrl?: string;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
};

type UcallerResponse = {
  status?: boolean;
  ucaller_id?: number | string;
  error?: string;
  error_message?: string;
};

export function otpFromText(text: string): string | null {
  return text.match(/^Лотос: код(?: для входа в личный кабинет)?(?:\s*—)?\s*(\d{4})\b/)?.[1] ?? null;
}

export function createUcallerSms(options: UcallerOptions): SmsSender {
  const fetchImpl = options.fetchImpl ?? fetch;
  const apiUrl = options.apiUrl ?? "https://api.ucaller.ru/v1.0/initCall";
  const timeoutMs = options.timeoutMs ?? 10_000;
  return {
    name: "ucaller",
    async send(phone, text): Promise<SmsResult> {
      const code = otpFromText(text);
      if (!code) {
        if (options.fallback) return options.fallback.send(phone, text);
        return { ok: false, error: "uCaller: канал предназначен только для кодов подтверждения" };
      }
      try {
        const url = new URL(apiUrl);
        url.searchParams.set("key", options.key);
        url.searchParams.set("service_id", options.serviceId);
        url.searchParams.set("phone", phone.replace(/\D/g, ""));
        url.searchParams.set("code", code);
        if (options.client) url.searchParams.set("client", options.client);
        const response = await fetchImpl(url, { signal: AbortSignal.timeout(timeoutMs) });
        if (!response.ok) return { ok: false, error: `uCaller: HTTP ${response.status}` };
        const data = await response.json() as UcallerResponse;
        if (data.status !== true || data.ucaller_id == null) {
          return { ok: false, error: `uCaller: ${data.error || data.error_message || "запрос отклонён"}` };
        }
        return { ok: true, messageId: String(data.ucaller_id) };
      } catch (error) {
        const message = error instanceof Error && error.name === "TimeoutError" ? "uCaller: таймаут запроса" : "uCaller: сетевая ошибка или некорректный ответ";
        return { ok: false, error: message };
      }
    },
  };
}
