import type { BookingServiceItem, BookingServiceSnapshot } from "@/domain/booking-service";
import { plural } from "@/lib/format";

export const MAX_LAB_SERVICES = 10;

export function parseLabServiceIds(value: unknown): number[] {
  const raw = Array.isArray(value) ? value[0] : value;
  if (typeof raw !== "string") return [];
  const ids: number[] = [];
  for (const part of raw.split(",")) {
    if (!/^\d{1,12}$/.test(part)) continue;
    const id = Number(part);
    if (Number.isSafeInteger(id) && id > 0 && !ids.includes(id)) ids.push(id);
    if (ids.length === MAX_LAB_SERVICES) break;
  }
  return ids;
}

export function labServicesQuery(ids: number[]): string {
  return ids.join(",");
}

export function makeLabPoolSnapshot(items: BookingServiceItem[]): BookingServiceSnapshot & { items: BookingServiceItem[] } {
  const sorted = [...items].sort((a, b) => a.serviceId - b.serviceId);
  const notes = [...new Set(sorted.map(item => item.prepNote?.trim()).filter((note): note is string => Boolean(note)))];
  return {
    title: `Анализы и пакеты · ${sorted.length} ${plural(sorted.length, "позиция", "позиции", "позиций")}`,
    kind: "analysis",
    durationMin: sorted.reduce((sum, item) => sum + item.durationMin, 0),
    priceKopecks: sorted.reduce((sum, item) => sum + item.priceKopecks, 0),
    prepayKopecks: sorted.reduce((sum, item) => sum + item.prepayKopecks, 0),
    prepNote: notes.join("\n") || null,
    items: sorted,
  };
}
