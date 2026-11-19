export type BookingServiceItem = {
  serviceId: number;
  code: string;
  title: string;
  durationMin: number;
  priceKopecks: number;
  prepayKopecks: number;
  prepNote: string | null;
};

export type BookingServiceSnapshot = {
  title: string;
  kind: string;
  durationMin: number;
  priceKopecks: number;
  prepayKopecks: number;
  prepNote?: string | null;
  items?: BookingServiceItem[];
};

export function isPoolSnapshot(service: { items?: unknown }): service is BookingServiceSnapshot & { items: BookingServiceItem[] } {
  return Array.isArray(service.items) && service.items.length > 0;
}
