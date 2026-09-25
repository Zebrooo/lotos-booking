import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { testDb, truncateAll } from "./helpers";
import type { Sql } from "@/lib/db/client";
import { seedDemoV2 } from "../../scripts/seed-demo-v2.ts";
import { crmDay, crmBookings, reconData, printData, doctorDays } from "@/lib/crm/data";

let sql: Sql;
beforeAll(() => { sql = testDb(); });
afterAll(async () => { await sql.end(); });
beforeEach(async () => { await truncateAll(sql); });

const now = new Date("2026-09-24T09:32:00Z"); // чт 14:32 по Челябинску, как в прототипе CRM
const clock = { now: () => now };
const hhmm = (m: number) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;

describe("данные CRM на демо-клинике", () => {
  it("колонки дня: записи врача, свободная квота сайта, группа", async () => {
    await seedDemoV2(sql, now, { staffPassword: "x" });
    const cols = await crmDay(sql, clock, "2026-09-24");
    const zh = cols.find(c => c.short === "Жаворонкова Е. В.")!;
    expect(zh).toMatchObject({ spec: "Кардиолог", off: null, group: null });
    expect(zh.bookings.map(b => [hhmm(b.startMin), b.status])).toEqual([
      ["09:00", "done"], ["09:40", "done"], ["11:00", "arrived"], ["14:00", "no_show"], ["15:30", "claimed"], ["16:10", "pending"]]);
    expect(zh.quota).toEqual([{ fromMin: 720, toMin: 750 }, { fromMin: 750, toMin: 780 }]);
    expect(cols.length).toBe(12);
  });

  it("запись: деньги, журнал, записавший, срок и заявленная оплата", async () => {
    await seedDemoV2(sql, now, { staffPassword: "x" });
    const day = await crmBookings(sql, clock, { from: "2026-09-24", to: "2026-09-24" });
    const kr = day.find(b => b.patientFull === "Кравцова Ольга Викторовна")!;
    expect(kr).toMatchObject({ source: "phone", money: "settled", phone: "+7 912 441-20-17", dob: "12.03.1968", durMin: 30, service: "Консультация кардиолога" });
    expect(kr.ops.map(o => [o.op, o.detail, o.sign])).toEqual([["Аванс получен", "Наличные · касса · чек аванса", "+"], ["Зачёт аванса", "чек при оказании услуги", "0"]]);
    const pt = day.find(b => b.patientFull === "Петров Иван Сергеевич")!;
    expect(pt).toMatchObject({ patient: "Петров Иван Сергеевич (ребёнок)", recorder: "Петрова Анна Викторовна, мать", isChild: true });
    const gv = day.find(b => b.patientFull === "Гаврилова Нина Петровна")!;
    expect(gv).toMatchObject({ status: "claimed", claimNote: "Пациент сообщил об оплате в 13:52", money: "none" });
    expect(gv.deadline!.toISOString()).toBe("2026-09-24T12:00:00.000Z");
    expect(day.find(b => b.patientFull === "Шевчук Андрей Павлович")!.reminder.kind).toBe("none");
    expect(kr.reminder.kind).toBe("not_site");
  });

  it("поиск по фамилии, телефону и номеру записи", async () => {
    await seedDemoV2(sql, now, { staffPassword: "x" });
    expect((await crmBookings(sql, clock, { q: "кравц" })).map(b => b.patientFull)).toEqual(["Кравцова Ольга Викторовна"]);
    expect((await crmBookings(sql, clock, { q: "441-20" })).map(b => b.patientFull)).toEqual(["Кравцова Ольга Викторовна"]);
    const one = (await crmBookings(sql, clock, { q: "кравц" }))[0]!;
    expect((await crmBookings(sql, clock, { q: String(one.id) })).map(b => b.id)).toContain(one.id);
  });

  it("сверка: поступления и записи, ждущие оплаты — заявленные первыми", async () => {
    await seedDemoV2(sql, now, { staffPassword: "x" });
    const r = await reconData(sql, clock);
    expect(r.incoming.map(i => i.text)).toEqual([
      "900: Зачисление 400р от ГОРЕЛОВ Д.Ю. Баланс …", "900: Зачисление 400р от НИНА ПЕТРОВНА Г. Баланс …", "Эквайринг: оплата 400.00 RUB, карта *4417, без назначения"]);
    expect(r.waiting.slice(0, 2).map(b => b.status)).toEqual(["claimed", "claimed"]);
    expect(r.waiting.every(b => b.status === "claimed" || b.status === "pending")).toBe(true);
  });

  it("лист на завтра и приём врача", async () => {
    await seedDemoV2(sql, now, { staffPassword: "x" });
    const print = await printData(sql, clock, "2026-09-25");
    expect(print.map(g => [g.doctor.short, g.rows.length])).toEqual([["Жаворонкова Е. В.", 2], ["Климова И. О.", 1], ["Гришин П. И.", 4], ["Никитина О. С.", 2]]);
    const [gr] = await sql<{ id: number }[]>`select id from resources where title like 'Гришин%'`;
    const days = await doctorDays(sql, clock, gr!.id);
    expect(days.map(d => [d.day, d.rows.length])).toEqual([["2026-09-24", 2], ["2026-09-25", 4]]);
  });
});

describe("подписи CRM как в прототипе", () => {
  it("блок расписания, шторка, сверка", async () => {
    const { bookingVM } = await import("@/lib/crm/view");
    await seedDemoV2(sql, now, { staffPassword: "x" });
    const day = await crmBookings(sql, clock, { from: "2026-09-24", to: "2026-09-24" });
    const vm = (name: string) => bookingVM(day.find(b => b.patientFull === name)!, now);
    const kr = vm("Кравцова Ольга Викторовна");
    expect(kr).toMatchObject({ time: "09:00", short: "Кравцова О. В.", state: "Приём состоялся", money: "400 ₽".replace(" ", " "), src: "Телефон" });
    expect(kr.block.sub).toBe("Консультация кардиолога · тел.");
    expect(kr.drawer.ops).toEqual([
      { t: "22.09 09:10", op: "Аванс получен", detail: "Наличные · касса · чек аванса", amount: "+400 ₽" },
      { t: "24.09 09:00", op: "Зачёт аванса", detail: "чек при оказании услуги", amount: "0 ₽" }]);
    expect(kr.drawer.facts).toEqual([
      { k: "Врач", v: "Жаворонкова Е. В." }, { k: "Услуга", v: "Консультация кардиолога" }, { k: "Когда", v: "24 сентября, чт, 09:00" },
      { k: "Записал", v: "сам пациент" }, { k: "Напоминание", v: "не отправляется (запись не с сайта)" }]);
    const gv = vm("Гаврилова Нина Петровна");
    expect(gv.block.sub).toBe("Оплата заявлена · до 17:00 · сайт");
    expect(gv.drawer).toMatchObject({ state: "Оплата заявлена", stateSub: "Пациент сообщил об оплате в 13:52", money: "Аванс не получен", stColor: "var(--color-accent-700)" });
    expect(gv.drawer.actions.map(a => a.label)).toEqual(["Сверить с поступлением", "Перенести", "Отменить запись"]);
    expect(gv.recon).toEqual({ line: "Жаворонкова Е. В. · 24 сентября, 15:30", deadline: "до 17:00 сегодня" });
    expect(vm("Зайцев Олег Николаевич").drawer.actions.map(a => a.label)).toEqual(["Пациент пришёл, документы подписаны", "Отметить неявку", "Перенести", "Отменить запись"]);
    expect(vm("Юсупов Ринат Маратович").drawer.actions[0]!.label).toBe("Отметить оплату наличными");
  });
});
