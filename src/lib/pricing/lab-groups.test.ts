import { describe, expect, it } from "vitest";
import { LAB_GROUPS, labGroup, matchesLabGroup } from "./lab-groups";

describe("рубрики анализов", () => {
  it("находит основные категории независимо от регистра", () => {
    expect(matchesLabGroup("Глюкоза и метаболиты углеводного обмена", labGroup("blood")!)).toBe(true);
    expect(matchesLabGroup("Технология ImmunoCAP", labGroup("allergy")!)).toBe(true);
    expect(matchesLabGroup("Лабораторная оценка функции щитовидной железы", labGroup("hormones")!)).toBe(true);
    expect(matchesLabGroup("Биохимический анализ мочи", labGroup("urine-stool")!)).toBe(true);
  });

  it("не относит неизвестную категорию к рубрике и не принимает произвольный id", () => {
    expect(matchesLabGroup("Исследования Chromolab", labGroup("blood")!)).toBe(false);
    expect(labGroup("unknown")).toBeUndefined();
    expect(LAB_GROUPS.map(group => group.id)).toEqual([...new Set(LAB_GROUPS.map(group => group.id))]);
  });
});
