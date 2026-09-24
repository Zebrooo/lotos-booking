// Цикл фоновой работы. Один проход — все очереди по порядку под сессионной
// блокировкой PostgreSQL: при нескольких экземплярах сервера работает один.
// Блокировка живёт на отдельном зарезервированном соединении, потому что
// снять сессионную блокировку можно только тем соединением, что её взяло.
import type { Sql } from "@/lib/db/client";
import type { Clock } from "@/ports/clock";
import type { Fiscalizer } from "@/ports/fiscal";
import type { Notifier } from "@/ports/notify";
import type { PaymentProvider } from "@/ports/payment";
import { expireHolds } from "@/lib/usecases/expire";
import { sendPendingReceipts, sendQueuedNotifications, retryRefunds, queueReminders, pollPendingPayments, type MailSettings } from "./sweeps";

/** Ключ сессионной блокировки: «lotos» в ASCII, чтобы не пересечься с чужими. */
export const RUNNER_LOCK_KEY = 0x6c6f746f73;

export type RunnerDeps = {
  sql: Sql; clock: Clock; payment: PaymentProvider; fiscal: Fiscalizer; notify: Notifier; mail: MailSettings;
  log?: (msg: string, err: unknown) => void;
};

export async function runOnce(d: RunnerDeps): Promise<Record<string, number>> {
  const conn = await d.sql.reserve();
  try {
    const [row] = await conn<{ locked: boolean }[]>`select pg_try_advisory_lock(${RUNNER_LOCK_KEY}) as locked`;
    if (!row?.locked) return { skipped: 1 };
    try {
      const log = d.log ?? ((msg, err) => console.error(`[фон] ${msg}:`, err));
      const result: Record<string, number> = { errors: 0 };
      const step = async (name: string, fn: () => Promise<number>) => {
        try {
          result[name] = await fn();
        } catch (e) {
          result[name] = 0;
          result.errors! += 1;
          log(name, e);
        }
      };
      // Порядок важен: сначала снять просроченное и провести пришедшие
      // оплаты, в конце отправить письма, поставленные этим же проходом.
      await step("expired", () => expireHolds(d.sql, d.clock));
      await step("polled", () => pollPendingPayments(d.sql, d.payment, d.clock));
      await step("refunds", () => retryRefunds(d.sql, d.payment));
      await step("receipts", () => sendPendingReceipts(d.sql, d.fiscal));
      await step("reminders", () => queueReminders(d.sql, d.clock));
      await step("notifications", () => sendQueuedNotifications(d.sql, d.notify, d.mail));
      const { errors, ...counts } = result;
      return { ...counts, errors: errors ?? 0 };
    } finally {
      await conn`select pg_advisory_unlock(${RUNNER_LOCK_KEY})`;
    }
  } finally {
    conn.release();
  }
}

/** Запускает проходы по таймеру; следующий не стартует, пока идёт предыдущий. Возвращает остановку. */
export function startRunner(d: RunnerDeps, intervalMs: number): () => void {
  let running = false;
  const tick = async () => {
    if (running) return;
    running = true;
    try {
      await runOnce(d);
    } catch (e) {
      (d.log ?? console.error)("проход не выполнен", e);
    } finally {
      running = false;
    }
  };
  const timer = setInterval(tick, intervalMs);
  timer.unref?.();
  void tick();
  return () => clearInterval(timer);
}
