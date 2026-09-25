"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";

/** Пока ждём оплату, страница перечитывает себя: подтверждение приходит банку на сервер. */
export function RefreshWhileWaiting({ untilIso, everyMs = 4000 }: { untilIso: string; everyMs?: number }) {
  const router = useRouter();
  useEffect(() => {
    const until = new Date(untilIso).getTime();
    const timer = setInterval(() => {
      router.refresh();
      if (Date.now() > until) clearInterval(timer);
    }, everyMs);
    return () => clearInterval(timer);
  }, [router, untilIso, everyMs]);
  return null;
}
