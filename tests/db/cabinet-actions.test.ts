import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { testDb, truncateAll } from "./helpers";
import type { Sql } from "@/lib/db/client";
import type { SmsSender } from "@/ports/sms";
import { seedDemoV2 } from "../../scripts/seed-demo-v2.ts";
import { requestLoginCode, loginWithCode, updateAccount, markDocumentRead, requestFromCabinet, bookingOfPhone, receiptOfPhone } from "@/lib/cabinet/actions";
import { phoneBySession } from "@/lib/cabinet/session";
import { cabinetData } from "@/lib/cabinet/data";

let sql: Sql;
beforeAll(() => { sql = testDb(); });
afterAll(async () => { await sql.end(); });
beforeEach(async () => { await truncateAll(sql); });

const now = new Date("2026-09-24T09:20:00Z");
const clock = { now: () => now };
const phone = "+79001234567";
function capture(): SmsSender & { sent: string[] } {
  const sent: string[] = [];
  return { name: "c", sent, send: async (p, t) => { sent.push(`${p}: ${t}`); return { ok: true, messageId: "1" }; } };
}
const deps = (sms: SmsSender) => ({ sms, clock, pepper: "t", genCode: () => "2604" });

describe("вход в кабинет", () => {
  it("код уходит только на известный номер; ответ одинаковый; верный код открывает сессию", async () => {
    await seedDemoV2(sql, now, { staffPassword: "x" });
    const sms = capture();
    expect(await requestLoginCode(sql, deps(sms), "+7 999 000-00-00")).toEqual({ ok: true });
    expect(sms.sent).toEqual([]);
    expect(await requestLoginCode(sql, deps(sms), "+7 900 123-45-67")).toEqual({ ok: true });
    expect(sms.sent).toEqual([`${phone}: Лотос: код для входа в личный кабинет — 2604. Никому его не сообщайте.`]);
    expect(await loginWithCode(sql, deps(sms), "+7 900 123-45-67", "0000")).toEqual({ ok: false, error: "Неверный код. Проверьте цифры из СМС" });
    const ok = await loginWithCode(sql, deps(sms), "+7 900 123-45-67", "2604");
    expect(ok.ok).toBe(true);
    if (ok.ok) expect(await phoneBySession(sql, clock, ok.sessionToken)).toBe(phone);
  });
  it("неполный номер — ошибка как в прототипе", async () => {
    expect(await requestLoginCode(sql, deps(capture()), "+7 900 12")).toEqual({ ok: false, error: "Введите номер полностью: +7 и 10 цифр" });
  });
});

describe("профиль и заявки", () => {
  it("почта для чеков и уведомления", async () => {
    await seedDemoV2(sql, now, { staffPassword: "x" });
    expect(await updateAccount(sql, phone, { email: "не почта" })).toEqual({ ok: false, error: "Проверьте адрес почты" });
    expect(await updateAccount(sql, phone, { email: " Elena@Mail.ru ", notifyEmail: true })).toEqual({ ok: true });
    const [a] = await sql<{ email: string; notifyEmail: boolean }[]>`select email, notify_email from patient_accounts where phone = ${phone}`;
    expect(a).toEqual({ email: "elena@mail.ru", notifyEmail: true });
    expect(await updateAccount(sql, phone, { email: "" })).toEqual({ ok: true });
    const [b] = await sql<{ email: string | null }[]>`select email from patient_accounts where phone = ${phone}`;
    expect(b!.email).toBeNull();
  });
  it("документ помечается прочитанным только своим; заявки сохраняются", async () => {
    await seedDemoV2(sql, now, { staffPassword: "x" });
    const [doc] = await sql<{ id: number }[]>`select id from medical_documents where title = 'Заключение кардиолога'`;
    expect(await markDocumentRead(sql, "+79990000000", doc!.id)).toBe(false);
    expect(await markDocumentRead(sql, phone, doc!.id)).toBe(true);
    expect(await requestFromCabinet(sql, clock, phone, "tax")).toBe(true);
    expect(await requestFromCabinet(sql, clock, phone, "child")).toBe(true);
    const r = await sql<{ kind: string }[]>`select kind from cabinet_requests order by id`;
    expect(r.map(x => x.kind)).toEqual(["tax", "child"]);
    const d = (await cabinetData(sql, clock, phone))!;
    expect(d).toMatchObject({ taxRequested: true, taxReadyOn: "2026-10-01" });
  });
  it("запись доступна только со своего телефона", async () => {
    await seedDemoV2(sql, now, { staffPassword: "x" });
    const [mine] = await sql<{ id: number }[]>`select b.id from bookings b join patients p on p.id = b.patient_id where p.phone = ${phone} limit 1`;
    const [other] = await sql<{ id: number }[]>`select b.id from bookings b join patients p on p.id = b.patient_id where p.phone <> ${phone} limit 1`;
    expect(await bookingOfPhone(sql, phone, mine!.id)).toMatchObject({ id: mine!.id, prepayKopecks: 40000 });
    expect(await bookingOfPhone(sql, phone, other!.id)).toBeNull();
  });
  it("чек по строке журнала — только своему телефону, включая возврат", async () => {
    await seedDemoV2(sql, now, { staffPassword: "x" });
    const d = (await cabinetData(sql, clock, phone))!;
    const refund = d.payments.find(p => p.amountKopecks < 0)!;
    const advance = d.payments.find(p => p.amountKopecks > 0)!;
    expect(await receiptOfPhone(sql, phone, refund.ledgerId)).toMatchObject({ kind: "refund", amountKopecks: 40000, phone, status: "sent" });
    expect(await receiptOfPhone(sql, phone, advance.ledgerId)).toMatchObject({ kind: "advance", patient: expect.stringContaining("Смирнова") });
    expect(await receiptOfPhone(sql, "+79990000000", advance.ledgerId)).toBeNull();
  });
});
