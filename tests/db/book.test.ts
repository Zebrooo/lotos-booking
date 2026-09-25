import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { testDb, truncateAll, seedClinic } from "./helpers";
import type { Sql } from "@/lib/db/client";
import type { PaymentProvider } from "@/ports/payment";
import { bookAndPay } from "@/lib/usecases/book";
import { createFakePaymentProvider } from "@/adapters/payment-fake";
import { localTime } from "@/domain/time";

let sql: Sql;
beforeAll(() => { sql = testDb(); });
afterAll(async () => { await sql.end(); });
beforeEach(async () => { await truncateAll(sql); });

const clock = { now: () => new Date("2026-09-14T06:00:00Z") };
const fake = createFakePaymentProvider({ baseUrl: "http://localhost:3000", secret: "s" });
const form = { relation: "self", fullName: "Иванов Иван Иванович", birthDate: "1980-01-01", phone: "+7 912 345-67-89",
  email: "ivanov@example.com", consentPd: "on", consentPrepay: "on" };
const START = localTime("2026-09-15", 600);

describe("bookAndPay", () => {
  it("удерживает слот, создаёт платёж, пишет согласия последних редакций", async () => {
    const s = await seedClinic(sql);
    const [pd2] = await sql<{ id: number }[]>`insert into consents (kind, version, body) values ('personal_data', 2, 'Редакция 2') returning id`;
    const r = await bookAndPay(sql, { payment: fake, clock }, { serviceId: s.consultId, doctorId: s.doctorId, startsAt: START, form, siteUrl: "http://localhost:3000", ip: "127.0.0.1", userAgent: "test" });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.token).toHaveLength(21);
    expect(r.payUrl).toContain("/dev/oplata/fake-");
    expect(r.payUrl).toContain(encodeURIComponent(`http://localhost:3000/moya-zapis/${r.token}`));
    const consents = await sql<{ consentId: number }[]>`select consent_id from booking_consents order by consent_id`;
    expect(consents.map(c => c.consentId)).toEqual([s.consentIds[1], pd2!.id].sort((a, b) => a - b));
    const [b] = await sql<{ status: string; bookerRelation: string }[]>`select status, booker_relation from bookings`;
    expect(b).toEqual({ status: "held", bookerRelation: "self" });
  });

  it("ошибки формы — по полям, записи нет", async () => {
    const s = await seedClinic(sql);
    const r = await bookAndPay(sql, { payment: fake, clock }, { serviceId: s.consultId, doctorId: s.doctorId, startsAt: START, form: { ...form, phone: "1" }, siteUrl: "http://x" });
    expect(r).toEqual({ ok: false, errors: { phone: "Телефон в формате +7 900 000-00-00" } });
    expect(await sql`select 1 from bookings`).toHaveLength(0);
  });

  it("занятое окно и пауза онлайн-записи — понятный текст для формы", async () => {
    const s = await seedClinic(sql);
    const input = { serviceId: s.consultId, doctorId: s.doctorId, startsAt: START, form, siteUrl: "http://x" };
    await bookAndPay(sql, { payment: fake, clock }, input);
    const taken = await bookAndPay(sql, { payment: fake, clock }, { ...input, form: { ...form, phone: "+7 912 000-00-00" } });
    expect(taken).toEqual({ ok: false, errors: { _form: "Это время только что заняли. Выберите другое." } });
    await sql`update settings set online_booking_paused = true`;
    const paused = await bookAndPay(sql, { payment: fake, clock }, { ...input, startsAt: localTime("2026-09-15", 900) });
    expect(paused).toEqual({ ok: false, errors: { _form: "Онлайн-запись временно приостановлена. Запишитесь по телефону клиники." } });
  });

  it("провайдер недоступен: удержание остаётся, ссылки на оплату нет", async () => {
    const s = await seedClinic(sql);
    const down: PaymentProvider = { ...fake, createPayment: async () => { throw new Error("timeout"); } };
    const r = await bookAndPay(sql, { payment: down, clock }, { serviceId: s.consultId, doctorId: s.doctorId, startsAt: START, form, siteUrl: "http://x" });
    expect(r).toMatchObject({ ok: true, payUrl: null });
    const [b] = await sql<{ status: string }[]>`select status from bookings`;
    expect(b!.status).toBe("held");
  });
});
