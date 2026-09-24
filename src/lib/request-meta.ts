// IP и User-Agent из заголовков запроса — для журнала согласий. IP берётся
// первым из X-Forwarded-For (его ставит обратный прокси) и проверяется,
// потому что колонка в базе типа inet.
import { isIP } from "node:net";

export function requestMeta(h: Headers): { ip?: string; userAgent?: string } {
  const forwarded = h.get("x-forwarded-for")?.split(",")[0]?.trim();
  const candidate = forwarded || h.get("x-real-ip")?.trim() || undefined;
  return {
    ip: candidate && isIP(candidate) ? candidate : undefined,
    userAgent: h.get("user-agent")?.slice(0, 500) || undefined,
  };
}
