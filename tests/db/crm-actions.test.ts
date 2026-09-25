import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { testDb, truncateAll } from "./helpers";
import type { Sql } from "@/lib/db/client";
import { seedDemoV2 } from "../../scripts/seed-demo-v2.ts";
import { crmBookings, crmDay } from "@/lib/crm/data";
import { recordCash, markArrived, reconcile, pauseOnline, resumeOnline, requestDayOff, moveOptions, closeDoctorDay, staffCancel, staffMove, staffDone, staffNoShow, giveManualRefund } from "@/lib/crm/actions";
import { loadSettings } from "@/lib/usecases/settings";

let sql: Sql;
beforeAll(() => { sql = testDb(); });
afterAll(async () => { await sql.end(); });
beforeEach(async () => { await truncateAll(sql); });

const now = new Date("2026-09-24T09:32:00Z"); // чт 14:32
const clock = { now: () => now };
const TODAY = "2026-09-24", TOMORROW = "2026-09-25";

async function seeded() {
  await seedDemoV2(sql, now, { staffPassword: "x" });
  const staff = Object.fromEntries((await sql<{ id: number; role: string }[]>`select id, role from admins`).map(a => [a.role, a.id])) as Record<"admin" | "senior" | "doctor", number>;
  const all = await crmBookings(sql, clock, { from: TODAY, to: TOMORROW });
  const by = (name: string) => all.find(b => b.patientFull === name)!;
  return { staff, by };
}
const statusOf = async (id: number) => (await sql<{ status: string }[]>`select status from bookings where id = ${id}`)[0]!.status;
const auditOf = async (id: number) => (await sql<{ action: string; adminId: number }[]>`select action, admin_id from audit where booking_id = ${id} order by id`);

describe("действия регистратуры", () => {
  it("оплата наличными: бронь подтверждается, аванс в журнале, чек и СМС, запись в аудите", async () => {
    const { staff, by } = await seeded();
    const b = by("Юсупов Ринат Маратович");
    expect(await recordCash(sql, clock, { bookingId: b.id, adminId: staff.admin })).toEqual({ ok: true });
    expect(await statusOf(b.id)).toBe("confirmed");
    const [after] = await crmBookings(sql, clock, { ids: [b.id] });
    expect(after!.ops.map(o => [o.op, o.detail])).toEqual([["Аванс получен", "Наличные · касса · чек аванса"]]);
    expect(await sql`select kind from receipts where booking_id = ${b.id}`).toEqual([{ kind: "advance" }]);
    expect(await sql`select template from notifications where booking_id = ${b.id}`).toEqual([{ template: "booking_confirmed" }]);
    expect(await auditOf(b.id)).toEqual([{ action: "cash_advance", adminId: staff.admin }]);
    expect(await recordCash(sql, clock, { bookingId: b.id, adminId: staff.admin })).toEqual({ ok: false, error: "Запись уже оплачена или закрыта" });
  });

  it("приход — только в день приёма; затем приём состоялся с чеком зачёта", async () => {
    const { staff, by } = await seeded();
    const tomorrow = by("Ефимова Валентина Ивановна");
    expect(await markArrived(sql, clock, { bookingId: tomorrow.id, adminId: staff.admin })).toEqual({ ok: false, error: "Отметить приход можно только в день приёма" });
    const b = by("Зайцев Олег Николаевич");
    expect(await markArrived(sql, clock, { bookingId: b.id, adminId: staff.admin })).toEqual({ ok: true });
    expect(await statusOf(b.id)).toBe("arrived");
    expect(await staffDone(sql, clock, { bookingId: b.id, adminId: staff.admin })).toEqual({ ok: true });
    expect(await statusOf(b.id)).toBe("done");
    expect((await auditOf(b.id)).map(a => a.action)).toEqual(["arrived", "done"]);
  });

  it("неявка — не раньше дня приёма", async () => {
    const { staff, by } = await seeded();
    expect(await staffNoShow(sql, clock, { bookingId: by("Ефимова Валентина Ивановна").id, adminId: staff.admin })).toEqual({ ok: false, error: "Неявку отмечают в день приёма" });
    const b = by("Тимофеев Роман Алексеевич");
    expect(await staffNoShow(sql, clock, { bookingId: b.id, adminId: staff.admin })).toEqual({ ok: true });
    expect(await statusOf(b.id)).toBe("no_show");
  });

  it("сверка: поступление закрывает заявленную оплату, пробивается чек, поступление уходит из списка", async () => {
    const { staff, by } = await seeded();
    const b = by("Горелов Денис Юрьевич");
    const [inc] = await sql<{ id: number }[]>`select id from bank_incoming where text like '%ГОРЕЛОВ%'`;
    expect(await reconcile(sql, clock, { incomingId: inc!.id, bookingId: b.id, adminId: staff.admin })).toEqual({ ok: true });
    expect(await statusOf(b.id)).toBe("confirmed");
    const [after] = await crmBookings(sql, clock, { ids: [b.id] });
    expect(after!.ops[0]).toMatchObject({ op: "Аванс получен", detail: "Сверено вручную с «900: Зачисление 400р от ГОРЕ…» · чек аванса" });
    expect(await sql`select matched_booking_id, matched_by from bank_incoming where id = ${inc!.id}`).toEqual([{ matchedBookingId: b.id, matchedBy: staff.admin }]);
    expect(await reconcile(sql, clock, { incomingId: inc!.id, bookingId: by("Гаврилова Нина Петровна").id, adminId: staff.admin })).toEqual({ ok: false, error: "Поступление уже сопоставлено" });
  });

  it("пауза онлайн-записи — только старший смены; причина и комментарий видны в CRM", async () => {
    const { staff } = await seeded();
    expect(await pauseOnline(sql, clock, { adminId: staff.admin, reason: "Врач заболел", comment: "" })).toEqual({ ok: false, error: "Приостановить онлайн-запись может только старший смены" });
    expect(await pauseOnline(sql, clock, { adminId: staff.senior, reason: "Сбой расписания / 1С", comment: "висит 1С" })).toEqual({ ok: true });
    const s = await loadSettings(sql);
    expect(s).toMatchObject({ onlineBookingPaused: true, pausedBy: "Горбунова Л. А.", pausedReason: "Сбой расписания / 1С", pausedComment: "висит 1С" });
    expect(s.pausedAt).toEqual(now);
    expect(await resumeOnline(sql, clock, { adminId: staff.admin })).toEqual({ ok: false, error: "Возобновить онлайн-запись может только старший смены" });
    expect(await resumeOnline(sql, clock, { adminId: staff.senior })).toEqual({ ok: true });
    expect((await loadSettings(sql)).onlineBookingPaused).toBe(false);
  });

  it("врач просит снять приём; администратор видит запрос", async () => {
    const { staff } = await seeded();
    expect(await requestDayOff(sql, clock, { adminId: staff.doctor, day: TOMORROW, text: "болезнь" })).toEqual({ ok: true });
    expect(await requestDayOff(sql, clock, { adminId: staff.admin, day: TOMORROW, text: "x" })).toEqual({ ok: false, error: "Запрос отправляет врач из своего кабинета" });
    const [r] = await sql<{ day: string; reason: string; text: string }[]>`select to_char(day, 'YYYY-MM-DD') as day, reason, text from doctor_requests`;
    expect(r).toEqual({ day: TOMORROW, reason: "Болезнь", text: "Гришин П. И. просит снять приём 25 сентября: болезнь" });
  });

  it("варианты переноса — ближайшие свободные окна того же врача и услуги", async () => {
    const { by } = await seeded();
    const opts = await moveOptions(sql, clock, { bookingId: by("Мельников Артём Олегович").id, count: 4 });
    expect(opts).toHaveLength(4);
    expect(opts[0]!.label).toMatch(/^(чт|пт|сб|пн|вт|ср), \d\d\.\d\d · \d\d:\d\d$/);
    expect(opts.every(o => o.startsAt > now)).toBe(true);
  });

  it("отмена и перенос регистратурой — с аудитом", async () => {
    const { staff, by } = await seeded();
    const a = by("Мельников Артём Олегович");
    const [opt] = await moveOptions(sql, clock, { bookingId: a.id, count: 1 });
    expect(await staffMove(sql, clock, { bookingId: a.id, startsAt: opt!.startsAt, adminId: staff.admin })).toMatchObject({ ok: true });
    expect(await statusOf(a.id)).toBe("transferred");
    const c = by("Ефимова Валентина Ивановна");
    expect(await staffCancel(sql, clock, { bookingId: c.id, initiator: "patient", adminId: staff.admin })).toEqual({ ok: true, refund: true });
    const [row] = await sql<{ cancelledBy: string; cancelReason: string }[]>`select cancelled_by, cancel_reason from bookings where id = ${c.id}`;
    expect(row).toEqual({ cancelledBy: "patient", cancelReason: "По просьбе пациента" });
    expect((await auditOf(c.id)).map(x => x.action)).toEqual(["cancel"]);
    const [cash] = await crmBookings(sql, clock, { ids: [c.id] });
    expect(cash!.money).toBe("refund_pending");
    expect(await giveManualRefund(sql, clock, { bookingId: c.id, adminId: staff.admin })).toEqual({ ok: true });
    const [done] = await crmBookings(sql, clock, { ids: [c.id] });
    expect(done!.money).toBe("refunded");
    expect(done!.ops.at(-1)).toMatchObject({ op: "Возврат выполнен", detail: "наличными в регистратуре · чек возврата", sign: "−" });
    expect(await sql`select kind, phone from receipts where booking_id = ${c.id} order by id`).toEqual([{ kind: "advance", phone: "+79021178264" }, { kind: "refund", phone: "+79021178264" }]);
    expect(await giveManualRefund(sql, clock, { bookingId: c.id, adminId: staff.admin })).toEqual({ ok: false, error: "Возврат не ожидается" });
  });

  it("снятие приёма: решение по каждому, отметка звонка; день закрывается, запрос врача разобран", async () => {
    const { staff } = await seeded();
    await requestDayOff(sql, clock, { adminId: staff.doctor, day: TOMORROW, text: "болезнь" });
    const [gr] = await sql<{ id: number }[]>`select id from resources where title like 'Гришин%'`;
    const list = (await crmBookings(sql, clock, { from: TOMORROW, to: TOMORROW, doctorId: gr!.id })).filter(b => ["pending", "claimed", "confirmed"].includes(b.status));
    expect(list).toHaveLength(4);
    const opts = await moveOptions(sql, clock, { bookingId: list[0]!.id, count: 1, avoidDay: TOMORROW });
    const decisions = list.map((b, i) => i === 0 ? { bookingId: b.id, kind: "move" as const, startsAt: opts[0]!.startsAt, called: true } : { bookingId: b.id, kind: "refund" as const, called: true });
    expect(await closeDoctorDay(sql, clock, { adminId: staff.admin, doctorId: gr!.id, day: TOMORROW, reason: "Болезнь", decisions: decisions.slice(1) }))
      .toEqual({ ok: false, error: "Решение нужно по каждой записи" });
    expect(await closeDoctorDay(sql, clock, { adminId: staff.admin, doctorId: gr!.id, day: TOMORROW, reason: "Болезнь", decisions: decisions.map(d => ({ ...d, called: false })) }))
      .toEqual({ ok: false, error: "Отметьте звонок каждому пациенту" });
    expect(await closeDoctorDay(sql, clock, { adminId: staff.admin, doctorId: gr!.id, day: TOMORROW, reason: "Болезнь", decisions })).toEqual({ ok: true });
    const col = (await crmDay(sql, clock, TOMORROW)).find(c => c.id === gr!.id)!;
    expect(col.off).toBe("Болезнь");
    expect(await statusOf(list[0]!.id)).toBe("transferred");
    expect(await statusOf(list[1]!.id)).toBe("cancelled");
    const [req] = await sql<{ handledAt: Date | null }[]>`select handled_at from doctor_requests`;
    expect(req!.handledAt).toEqual(now);
  });
});
