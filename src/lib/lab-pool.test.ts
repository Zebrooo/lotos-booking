import { describe, expect, it } from "vitest";
import { makeLabPoolSnapshot, parseLabServiceIds } from "./lab-pool";

const item = (serviceId: number, priceKopecks: number, prepayKopecks: number, durationMin: number, prepNote: string | null = null) => ({
  serviceId, code: String(serviceId), title: `Анализ ${serviceId}`, priceKopecks, prepayKopecks, durationMin, prepNote,
});

describe("данные lab-пула", () => {
  it("разбирает query, убирает дубликаты и невалидные id, ограничивает выбор", () => {
    expect(parseLabServiceIds("5,2,5,x,0,-1,3")).toEqual([5, 2, 3]);
    expect(parseLabServiceIds(Array.from({ length: 12 }, (_, i) => i + 1).join(","))).toHaveLength(10);
    expect(parseLabServiceIds(undefined)).toEqual([]);
  });

  it("сортирует состав и суммирует только серверные цены, предоплату и длительность", () => {
    const snapshot = makeLabPoolSnapshot([item(8, 20000, 5000, 20, "Натощак"), item(3, 30000, 7000, 15, "Натощак")]);
    expect(snapshot).toMatchObject({ durationMin: 35, priceKopecks: 50000, prepayKopecks: 12000, prepNote: "Натощак" });
    expect(snapshot.items?.map(x => x.serviceId)).toEqual([3, 8]);
  });
});
