import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { testDb, truncateAll, seedClinic } from "./helpers";
import type { Sql } from "@/lib/db/client";
import type { SmsSender } from "@/ports/sms";
import { startBooking, confirmBookingCode, resendBookingCode } from "@/lib/usecases/start-booking";
import { phoneBySession } from "@/lib/cabinet/session";
import { localTime } from "@/domain/time";

let sql: Sql;
beforeAll(() => { sql = testDb(); });
afterAll(async () => { await sql.end(); });
beforeEach(async () => { await truncateAll(sql); });

const now = new Date("2026-09-14T06:00:00Z"); // пн 11:00 по Челябинску
const at = (sec: number) => ({ now: () => new Date(now.getTime() + sec * 1000) });
function capture(): SmsSender & { sent: { phone: string; text: string }[] } {
  const sent: { phone: string; text: string }[] = [];
  return { name: "capture", sent, send: async (phone, text) => { sent.push({ phone, text }); return { ok: true, messageId: "1" }; } };
}
const self = { fio: "Смирнова Елена Андреевна", dob: "14.03.1988", phone: "+7 900 123-45-67", repFio: "", phone2: "" };
const deps = (sms: SmsSender, sec = 0) => ({ sms, clock: at(sec), pepper: "t", genCode: () => "2604", siteUrl: "https://zapis.example.ru" });

async function start(sms: SmsSender, over: Partial<Parameters<typeof startBooking>[2]> = {}) {
  const s = await seedClinic(sql);
  const r = await startBooking(sql, deps(sms), { serviceId: s.consultId, doctorId: s.doctorId, startsAt: localTime("2026-09-17", 600),
    who: "self", form: self, consentPd: true, consentPrepay: true, payChoice: "online", ...over });
  return { s, r };
}

describe("startBooking", () => {
  it("проверяет форму как прототип: ошибки полей и согласий", async () => {
    const { r } = await start(capture(), { form: { ...self, phone: "+7 351 222-33-44" }, consentPrepay: false });
    expect(r).toEqual({ ok: false, errors: { phone: "Нужен мобильный — на него придёт СМС", consent: "Отметьте оба пункта — без них записаться нельзя" } });
    expect(await sql`select 1 from bookings`).toHaveLength(0);
  });

  it("удерживает окно, шлёт код и ссылку одним СМС", async () => {
    const sms = capture();
    const { r } = await start(sms);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const [b] = await sql<{ status: string; payMode: string; phoneVerifiedAt: Date | null }[]>`select status, pay_mode, phone_verified_at from bookings`;
    expect(b).toEqual({ status: "held", payMode: "online", phoneVerifiedAt: null });
    expect(sms.sent).toEqual([{ phone: "+79001234567", text: `Лотос: код 2604. Запись и оплата: https://zapis.example.ru/moya-zapis/${r.token}` }]);
  });

  it("ребёнок: пациент — ребёнок, записал представитель; другой взрослый: телефон пациента и токен согласия", async () => {
    const { r } = await start(capture(), { who: "child", form: { ...self, fio: "Смирнова Мария Игоревна", dob: "02.06.2017", repFio: "Смирнова Елена Андреевна" } });
    expect(r.ok).toBe(true);
    const [c] = await sql<{ fullName: string; phone: string; bookerRelation: string; bookerName: string; bookerPhone: string }[]>`
      select p.full_name, p.phone, b.booker_relation, b.booker_name, b.booker_phone from bookings b join patients p on p.id = b.patient_id`;
    expect(c).toEqual({ fullName: "Смирнова Мария Игоревна", phone: "+79001234567", bookerRelation: "child", bookerName: "Смирнова Елена Андреевна", bookerPhone: "+79001234567" });
    await truncateAll(sql);
    const { r: r2 } = await start(capture(), { who: "other", form: { ...self, fio: "Смирнов Андрей Петрович", dob: "01.02.1960", phone2: "+7 912 000-11-22" } });
    expect(r2.ok).toBe(true);
    const [o] = await sql<{ phone: string; bookerRelation: string; bookerPhone: string; patientConsentToken: string | null }[]>`
      select p.phone, b.booker_relation, b.booker_phone, b.patient_consent_token from bookings b join patients p on p.id = b.patient_id`;
    expect(o).toMatchObject({ phone: "+79120001122", bookerRelation: "relative", bookerPhone: "+79001234567" });
    expect(o!.patientConsentToken).toHaveLength(21);
  });

  it("бронь до 17:00 доступна, если касса успевает; иначе — только онлайн", async () => {
    const { r } = await start(capture(), { payChoice: "reserve" });
    const [b] = await sql<{ payMode: string }[]>`select pay_mode from bookings`;
    expect(r.ok && b!.payMode).toBe("reserve");
    await truncateAll(sql);
    const s = await seedClinic(sql);
    const soon = await startBooking(sql, deps(capture()), { serviceId: s.consultId, doctorId: s.doctorId, startsAt: localTime("2026-09-14", 750),
      who: "self", form: self, consentPd: true, consentPrepay: true, payChoice: "reserve" });
    expect(soon.ok).toBe(true);
    const [b2] = await sql<{ payMode: string }[]>`select pay_mode from bookings`;
    expect(b2!.payMode).toBe("online");
  });

  it("режим клиники «только онлайн» игнорирует выбор брони", async () => {
    await sql`update settings set pay_model = 'online'`;
    await start(capture(), { payChoice: "reserve" });
    const [b] = await sql<{ payMode: string }[]>`select pay_mode from bookings`;
    expect(b!.payMode).toBe("online");
  });
});

describe("confirmBookingCode", () => {
  it("неверный код — ошибка; верный — телефон подтверждён, онлайн идёт к оплате, открыта сессия кабинета", async () => {
    const { r } = await start(capture());
    if (!r.ok) throw new Error("старт не удался");
    expect(await confirmBookingCode(sql, deps(capture(), 20), { token: r.token, code: "1111" })).toEqual({ ok: false, error: "Неверный код. Проверьте цифры из СМС" });
    const ok = await confirmBookingCode(sql, deps(capture(), 30), { token: r.token, code: "2604" });
    expect(ok).toMatchObject({ ok: true, next: "pay" });
    if (!ok.ok) return;
    expect(await phoneBySession(sql, at(40), ok.sessionToken)).toBe("+79001234567");
    const [b] = await sql<{ status: string; phoneVerifiedAt: Date | null }[]>`select status, phone_verified_at from bookings`;
    expect(b!.status).toBe("held");
    expect(b!.phoneVerifiedAt).not.toBeNull();
  });

  it("бронь: после кода — «ждёт оплаты» до 17:00, окно держится; другой взрослый получает ссылку согласия", async () => {
    const sms = capture();
    const { r } = await start(sms, { payChoice: "reserve", who: "other", form: { ...self, fio: "Смирнов Андрей Петрович", dob: "01.02.1960", phone2: "+7 912 000-11-22" } });
    if (!r.ok) throw new Error("старт не удался");
    const ok = await confirmBookingCode(sql, deps(sms, 30), { token: r.token, code: "2604" });
    expect(ok).toMatchObject({ ok: true, next: "done" });
    const [b] = await sql<{ status: string; payDeadline: Date; holdUntil: Date | null; patientConsentToken: string }[]>`select status, pay_deadline, hold_until, patient_consent_token from bookings`;
    expect(b).toMatchObject({ status: "pending", holdUntil: null });
    expect(b!.payDeadline.toISOString()).toBe("2026-09-14T12:00:00.000Z");
    expect(sms.sent.at(-1)).toEqual({ phone: "+79120001122", text: `Лотос: вас записали на приём. Подтвердите согласие: https://zapis.example.ru/soglasie/${b!.patientConsentToken}` });
  });

  it("повторная отправка кода — не раньше чем через минуту", async () => {
    const sms = capture();
    const { r } = await start(sms);
    if (!r.ok) throw new Error("старт не удался");
    expect(await resendBookingCode(sql, deps(sms, 30), r.token)).toEqual({ ok: false, error: "Отправить повторно можно через 30 с" });
    expect(await resendBookingCode(sql, deps(sms, 61), r.token)).toEqual({ ok: true });
    expect(sms.sent).toHaveLength(2);
  });
});
