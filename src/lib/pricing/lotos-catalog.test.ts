import { describe, expect, it } from "vitest";
import { normalizeLotosTitle, selectLotosRows } from "./lotos-catalog";

describe("каталог Лотоса из XLSX", () => {
  it("исключает нулевые и повторные названия, сохраняя первую ненулевую позицию", () => {
    const result = selectLotosRows([
      { code: "02-001", title: " Общий   анализ крови ", priceKopecks: 50000 },
      { code: "70-001", title: "общий анализ крови", priceKopecks: 13000 },
      { code: "03-001", title: "D-димер", priceKopecks: 0 },
    ]);
    expect(result).toEqual({ rows: [{ code: "02-001", title: "Общий   анализ крови", priceKopecks: 50000 }], total: 3, zero: 1, duplicates: 1 });
  });

  it("нормализует регистр, ё и знаки препинания", () => {
    expect(normalizeLotosTitle("  Витамин B9 (фолиевая кислота) ")).toBe("витамин b9 фолиевая кислота");
    expect(normalizeLotosTitle("Ёлка, тест")).toBe("елка тест");
  });
});
