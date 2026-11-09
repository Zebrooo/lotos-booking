import type { SmsSender, SmsResult } from "@/ports/sms";

type SmscOptions = {
  apiKey: string;
  sender: string;
  apiUrl?: string;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
};

type SmscResponse = {
  id?: number | string;
  error?: string;
  error_code?: number;
};

const ERROR_TEXT: Record<number, string> = {
  1: "SMSC: ошибка в параметрах запроса",
  2: "SMSC: неверный API-ключ или IP-адрес сервера не добавлен в список разрешённых",
  3: "SMSC: недостаточно средств или ошибка в параметрах сообщения",
  4: "SMSC: IP-адрес временно заблокирован",
  5: "SMSC: ошибка в формате даты сообщения",
  6: "SMSC: сообщение запрещено настройками или текстом",
  7: "SMSC: неверный формат номера телефона",
  8: "SMSC: сообщение не может быть доставлено",
  9: "SMSC: слишком много одинаковых или одновременных запросов",
};

export function createSmscSms(options: SmscOptions): SmsSender {
  const fetchImpl = options.fetchImpl ?? fetch;
  const apiUrl = options.apiUrl ?? "https://smsc.ru/rest/send/";
  const timeoutMs = options.timeoutMs ?? 10_000;
  return {
    name: "smsc",
    async send(phone, text): Promise<SmsResult> {
      try {
        const response = await fetchImpl(apiUrl, {
          method: "POST",
          headers: { "content-type": "application/json", accept: "application/json" },
          body: JSON.stringify({ apikey: options.apiKey, phones: phone, mes: text, sender: options.sender, cost: 0, fmt: 3, charset: "utf-8" }),
          signal: AbortSignal.timeout(timeoutMs),
        });
        if (!response.ok) return { ok: false, error: `SMSC: HTTP ${response.status}` };
        const data = await response.json() as SmscResponse;
        if (data.error_code != null || data.id == null) {
          const code = data.error_code;
          return { ok: false, error: code != null ? ERROR_TEXT[code] ?? `SMSC: ошибка ${code}` : "SMSC: некорректный ответ без идентификатора сообщения" };
        }
        return { ok: true, messageId: String(data.id) };
      } catch (error) {
        const message = error instanceof Error && error.name === "TimeoutError" ? "SMSC: таймаут запроса" : "SMSC: сетевая ошибка или некорректный ответ";
        return { ok: false, error: message };
      }
    },
  };
}
