// Тексты согласий для страниц документов: последняя редакция каждого вида.
import type { Db } from "@/lib/db/client";

export type ConsentKind = "personal_data" | "prepay_terms";
export type Consent = { id: number; kind: ConsentKind; version: number; body: string; publishedAt: Date };

export async function getLatestConsent(sql: Db, kind: ConsentKind): Promise<Consent | null> {
  const [c] = await sql<Consent[]>`select id, kind, version, body, published_at from consents
    where kind = ${kind} order by version desc limit 1`;
  return c ?? null;
}
