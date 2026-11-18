import type { SmsSender, SmsResult } from "@/ports/sms";

type SmsruOptions = {
  apiId: string;
  sender: string;
  apiUrl?: string;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
};

type SmsruStatus = {
  status?: string;
  status_code?: number;
  sms_id?: string;
};

type SmsruResponse = SmsruStatus & {
  sms?: Record<string, SmsruStatus>;
};

const ERROR_TEXT: Record<number, string> = {
  200: "SMS.ru: неверный API-ключ",
  201: "SMS.ru: недостаточно средств",
  202: "SMS.ru: неверный номер получателя",
  203: "SMS.ru: пустой текст сообщения",
  204: "SMS.ru: оператор получателя не подключён у отправителя",
  205: "SMS.ru: превышен суточный лимит сообщения на номер",
  206: "SMS.ru: превышен дневной лимит сообщений",
  207: "SMS.ru: сообщение не может быть доставлено",
  208: "SMS.ru: ошибка в параметре времени отправки",
  209: "SMS.ru: превышен лимит одинаковых сообщений",
  210: "SMS.ru: ошибка параметра callback",
  211: "SMS.ru: ошибка параметра ttl",
  212: "SMS.ru: ошибка параметра test",
  213: "SMS.ru: ошибка параметра partner_id",
  214: "SMS.ru: ошибка параметра ip",
  215: "SMS.ru: ошибка параметра from",
  216: "SMS.ru: ошибка параметра to",
  217: "SMS.ru: ошибка параметра msg",
  218: "SMS.ru: ошибка параметра json",
  219: "SMS.ru: ошибка параметра translit",
  220: "SMS.ru: сервис временно недоступен, повторите запрос позже",
  221: "SMS.ru: необходимо создать и согласовать буквенного отправителя",
  222: "SMS.ru: текст не соответствует одобренному шаблону",
  230: "SMS.ru: превышен лимит сообщений в минуту",
  231: "SMS.ru: превышен лимит одинаковых сообщений на номер",
  232: "SMS.ru: ошибка параметра time",
  233: "SMS.ru: ошибка параметра ip",
  300: "SMS.ru: неверный токен авторизации",
  301: "SMS.ru: неверный API-ключ или пароль",
  302: "SMS.ru: аккаунт не подтверждён регистрационным кодом",
  500: "SMS.ru: ошибка сервиса, повторите запрос позже",
};

function errorText(code: number | undefined): string {
  return code != null ? ERROR_TEXT[code] ?? `SMS.ru: ошибка ${code}` : "SMS.ru: некорректный ответ сервиса";
}

export function createSmsruSms(options: SmsruOptions): SmsSender {
  const fetchImpl = options.fetchImpl ?? fetch;
  const apiUrl = options.apiUrl ?? "https://sms.ru/sms/send";
  const timeoutMs = options.timeoutMs ?? 10_000;
  return {
    name: "smsru",
    async send(phone, text): Promise<SmsResult> {
      try {
        const body = new URLSearchParams({ api_id: options.apiId, to: phone, msg: text, from: options.sender, json: "1" });
        const response = await fetchImpl(apiUrl, {
          method: "POST",
          headers: { "content-type": "application/x-www-form-urlencoded", accept: "application/json" },
          body,
          signal: AbortSignal.timeout(timeoutMs),
        });
        if (!response.ok) return { ok: false, error: `SMS.ru: HTTP ${response.status}` };
        const data = await response.json() as SmsruResponse;
        if (data.status_code !== 100) return { ok: false, error: errorText(data.status_code) };
        const status = data.sms?.[phone] ?? Object.values(data.sms ?? {})[0];
        if (!status || status.status_code !== 100 || !status.sms_id) {
          return { ok: false, error: errorText(status?.status_code) };
        }
        return { ok: true, messageId: status.sms_id };
      } catch (error) {
        const message = error instanceof Error && error.name === "TimeoutError" ? "SMS.ru: таймаут запроса" : "SMS.ru: сетевая ошибка или некорректный ответ";
        return { ok: false, error: message };
      }
    },
  };
}
