import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { testDb, truncateAll } from "./helpers";
import type { Sql } from "@/lib/db/client";
import { seedDemoV2 } from "../../scripts/seed-demo-v2.ts";
import { cabinetData } from "@/lib/cabinet/data";
import { cabinetViewModel } from "@/lib/cabinet/view-model";

let sql: Sql;
beforeAll(() => { sql = testDb(); });
afterAll(async () => { await sql.end(); });
beforeEach(async () => { await truncateAll(sql); });

const now = new Date("2026-09-24T09:20:00Z"); // чт 14:20 по Челябинску
const clock = { now: () => now };

describe("подписи кабинета как в прототипе", () => {
  it("люди, ближайший приём, записи, документы, платежи", async () => {
    await seedDemoV2(sql, now, { staffPassword: "x" });
    const vm = cabinetViewModel((await cabinetData(sql, clock, "+79001234567"))!, now, { address: "Еманжелинск, ул. Гагарина, 12А" });
    expect(vm.greeting).toBe("Здравствуйте, Елена");
    expect(vm.people[0]).toMatchObject({ key: "all", name: "Все", sub: "Елена и Мария", initial: "ЕМ" });
    const up = vm.visits.filter(v => v.kind === "up");
    expect(up[0]).toMatchObject({ dnum: "26", dmon: "сен · сб", svc: "Консультация офтальмолога", line: "Фёдоров А. В. · 10:30", whoName: "Мария",
      stLabel: "Ждёт оплаты до 17:00 сегодня", price: "1\u00a0600 ₽", nextWhen: "26 сентября, 10:30", payLabel: "Оплатить до 17:00 сегодня" });
    expect(up[1]).toMatchObject({ dnum: "2", dmon: "окт · пт", stLabel: "Подтверждена", laterWhen: "2 октября, пт · 10:00" });
    expect(up[1]!.dialog).toMatchObject({ when: "2 октября, пт · 10:00", line: "УЗИ сердца (ЭхоКГ) · Жаворонкова Е. В., кардиолог" });
    expect(up[1]!.dialog.rows).toEqual([
      { k: "Пациент", v: "Смирнова Елена Андреевна" }, { k: "Стоимость", v: "2\u00a0600 ₽" },
      { k: "Предоплата", v: "400 ₽ внесено — засчитается" }, { k: "Адрес", v: "Еманжелинск, ул. Гагарина, 12А" },
    ]);
    const lipid = vm.docs.find(d => d.title === "Липидный профиль")!;
    expect(lipid).toMatchObject({ typeLabel: "Анализы", meta: "13 сентября · Лаборатория «Лотос»", note: "2 показателя вне нормы", isNew: true, cta: "Открыть →" });
    expect(vm.docs.find(d => d.kind === "study")).toMatchObject({ note: "Готовится · будет 26 сентября", cta: "Пришлём СМС", proc: true });
    expect(vm.payments[0]).toMatchObject({ date: expect.any(String), sub: expect.stringContaining("Елена · ") });
    expect(vm.payTotal).toBe("2\u00a0400 ₽");
    expect(vm.family.map(f => f.sub)).toEqual(["Вы · 14.03.1988", "Дочь · 9 лет · 02.06.2017"]);
    expect(up[0]).toMatchObject({ prepay: "400 ₽", payable: true });
    expect(vm.payYear).toBe("2026");
    expect(vm.payTotalSubAll).toBe("За вас и Марию · с учётом возвратов");
    expect(vm.taxDoneText).toBeNull();
    expect(vm.consents[0]).toMatchObject({ href: "/dokumenty/soglasie-pd" });
    expect(vm.payments[0]!.receiptHref).toMatch(/^\/kabinet\/chek\/\d+$/);
  });

});
