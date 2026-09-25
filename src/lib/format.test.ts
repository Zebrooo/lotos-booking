import { describe, it, expect } from "vitest";
import { rub, relName, dayLong, nearestLabel, hhmmOf, wdShort, monShort, plural, splitName, shortName, dateNum, lowerFirst, accusativeName } from "./format";
import { localTime } from "@/domain/time";

const today = "2026-09-24";

describe("форматы как в прототипе", () => {
  it("рубли — toLocaleString ru-RU и « ₽»", () => {
    expect(rub(180000)).toBe("1 800 ₽");
    expect(rub(40000)).toBe("400 ₽");
    expect(rub(-40000)).toBe("-400 ₽");
  });
  it("относительные дни", () => {
    expect(relName("2026-09-24", today)).toBe("сегодня");
    expect(relName("2026-09-25", today)).toBe("завтра");
    expect(relName("2026-09-26", today)).toBe("");
    expect(dayLong("2026-09-25", today)).toBe("завтра, 25 сентября");
    expect(dayLong("2026-09-26", today)).toBe("26 сентября");
  });
  it("ближайшее время", () => {
    expect(nearestLabel(localTime("2026-09-24", 940), today)).toBe("сегодня, 15:40");
    expect(nearestLabel(localTime("2026-09-26", 600), today)).toBe("сб, 26 сентября, 10:00");
  });
  it("мелочи", () => {
    expect(hhmmOf(localTime("2026-09-24", 545))).toBe("09:05");
    expect(wdShort("2026-09-27")).toBe("вс");
    expect(monShort("2026-09-27")).toBe("сен");
    expect(dateNum("2026-10-02")).toBe("2 октября");
    expect(plural(3, "врач", "врача", "врачей")).toBe("врача");
    expect(plural(12, "врач", "врача", "врачей")).toBe("врачей");
    expect(splitName("Жаворонкова Елена Викторовна")).toEqual({ surname: "Жаворонкова", given: "Елена Викторовна" });
    expect(shortName("Жаворонкова Елена Викторовна")).toBe("Жаворонкова Е. В.");
  });
});

describe("lowerFirst", () => {
  it("обычные слова — со строчной, аббревиатуры — как есть", () => {
    expect(lowerFirst("Консультация эндокринолога")).toBe("консультация эндокринолога");
    expect(lowerFirst("УЗИ сердца (ЭхоКГ)")).toBe("УЗИ сердца (ЭхоКГ)");
    expect(lowerFirst("ЭКГ")).toBe("ЭКГ");
  });
});

describe("accusativeName", () => {
  it("винительный падеж имён для подписи «За вас и …»", () => {
    expect(["Мария", "Маша", "Иван", "Илья", "Игорь", "Андрей", "Никита"].map(accusativeName))
      .toEqual(["Марию", "Машу", "Ивана", "Илью", "Игоря", "Андрея", "Никиту"]);
  });
});
