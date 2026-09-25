import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { testDb, truncateAll } from "./helpers";
import type { Sql } from "@/lib/db/client";
import { seedDemoV2 } from "../../scripts/seed-demo-v2.ts";
import { cabinetData } from "@/lib/cabinet/data";
import { cancelBooking } from "@/lib/usecases/cancel";

let sql: Sql;
beforeAll(() => { sql = testDb(); });
afterAll(async () => { await sql.end(); });
beforeEach(async () => { await truncateAll(sql); });

const now = new Date("2026-09-24T09:20:00Z"); // чт 14:20 по Челябинску, как в прототипе
const clock = { now: () => now };
const phone = "+79001234567";

describe("данные кабинета", () => {
  it("люди: владелец и дочь с подписями как в прототипе", async () => {
    await seedDemoV2(sql, now, { staffPassword: "x" });
    const d = (await cabinetData(sql, clock, phone))!;
    expect(d.owner).toMatchObject({ fullName: "Смирнова Елена Андреевна", firstName: "Елена" });
    expect(d.people.map(p => [p.name, p.full, p.sub, p.initial, p.dob])).toEqual([
      ["Елена", "Смирнова Елена Андреевна", "Вы · 38 лет", "Е", "14.03.1988"],
      ["Мария", "Смирнова Мария Игоревна", "Дочь · 9 лет", "М", "02.06.2017"],
    ]);
  });

  it("записи: предстоящие, прошедшие, отменённые; ближайшая — Машина бронь до 17:00", async () => {
    await seedDemoV2(sql, now, { staffPassword: "x" });
    const d = (await cabinetData(sql, clock, phone))!;
    const by = (k: string) => d.visits.filter(v => v.kind === k);
    expect([by("up").length, by("done").length, by("cancelled").length]).toEqual([2, 5, 1]);
    const next = by("up")[0]!;
    expect(next).toMatchObject({ serviceTitle: "Консультация офтальмолога", doctorShort: "Фёдоров А. В.", paid: false, canPay: true });
    expect(next.deadline?.toISOString()).toBe("2026-09-24T12:00:00.000Z");
    expect(by("cancelled")[0]!.note).toBe("Вы отменили 13 августа · 400 ₽ вернули на карту");
    const lab = d.visits.find(v => v.serviceTitle.startsWith("Анализы крови"))!;
    expect(lab).toMatchObject({ doctorShort: "Процедурный кабинет", docIds: expect.arrayContaining([expect.any(Number)]) });
    expect(lab.docIds).toHaveLength(2);
  });

  it("документы: новые — непрочитанные и готовые; исследование готовится; рекомендация из заключения", async () => {
    await seedDemoV2(sql, now, { staffPassword: "x" });
    const d = (await cabinetData(sql, clock, phone))!;
    expect(d.docs.filter(x => x.isNew).map(x => x.title)).toEqual(["Липидный профиль", "Заключение кардиолога"]);
    expect(d.docs.find(x => x.kind === "study")).toMatchObject({ title: "Суточное мониторирование ЭКГ", readyOn: "2026-09-26", isNew: false });
    expect(d.recommendation).toMatchObject({ text: "Повторный приём до 15 октября", who: "Жаворонкова Е. В. · из заключения от 12 сентября" });
  });

  it("платежи: предоплаты и возвраты по журналу; согласия; настройки", async () => {
    await seedDemoV2(sql, now, { staffPassword: "x" });
    const d = (await cabinetData(sql, clock, phone))!;
    expect(d.payments.map(p => p.amountKopecks).reduce((a, b) => a + b, 0)).toBe(240000);
    expect(d.payments.find(p => p.amountKopecks < 0)).toMatchObject({ what: "Возврат предоплаты · консультация эндокринолога", how: "На карту" });
    expect(d.payments.find(p => p.what.includes("УЗИ сердца"))).toMatchObject({ what: "Предоплата · УЗИ сердца (ЭхоКГ), 2 октября", how: "Онлайн · карта или СБП" });
    expect(d.consents.map(c => c.title)).toEqual(["Согласие на обработку персональных данных", "Согласие на обработку данных ребёнка · Мария", "Условия предоплаты"]);
    expect(d.account).toEqual({ email: null, notifyRemind: true, notifyResults: true, notifyEmail: false });
    expect(d.consents.map(c => c.href)).toEqual(["/dokumenty/soglasie-pd", "/dokumenty/soglasie-pd", "/dokumenty/predoplata"]);
    expect(d.taxRequested).toBe(false);
    expect(d.taxReadyOn).toBeNull();
  });

  it("отмена сегодня: «Вы отменили сегодня» и возврат предоплаты", async () => {
    await seedDemoV2(sql, now, { staffPassword: "x" });
    const before = (await cabinetData(sql, clock, phone))!;
    const paid = before.visits.find(v => v.kind === "up" && v.paid)!;
    await cancelBooking(sql, clock, { bookingId: paid.id, actor: "patient" });
    const after = (await cabinetData(sql, clock, phone))!;
    expect(after.visits.find(v => v.id === paid.id)).toMatchObject({ kind: "cancelled", note: "Вы отменили сегодня · 400 ₽ вернутся на карту" });
  });

  it("чужой телефон — пустой кабинет без владельца", async () => {
    await seedDemoV2(sql, now, { staffPassword: "x" });
    expect(await cabinetData(sql, clock, "+79990000000")).toBeNull();
  });
});
