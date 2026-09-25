// «Другой взрослый»: пациент сам даёт согласие по ссылке из СМС.
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { testDb, truncateAll, seedClinic } from "./helpers";
import type { Sql } from "@/lib/db/client";
import type { SmsSender } from "@/ports/sms";
import { startBooking, confirmBookingCode } from "@/lib/usecases/start-booking";
import { consentView, givePatientConsent } from "@/lib/usecases/patient-consent";
import { transferBooking } from "@/lib/usecases/transfer";
import { cancelBooking } from "@/lib/usecases/cancel";
import { localTime } from "@/domain/time";

let sql: Sql;
beforeAll(() => { sql = testDb(); });
afterAll(async () => { await sql.end(); });
beforeEach(async () => { await truncateAll(sql); });

const now = new Date("2026-09-14T06:00:00Z");
const clock = { now: () => now };
function capture(): SmsSender & { sent: { phone: string; text: string }[] } {
  const sent: { phone: string; text: string }[] = [];
  return { name: "capture", sent, send: async (phone, text) => { sent.push({ phone, text }); return { ok: true, messageId: "1" }; } };
}
const other = { fio: "Смирнов Игорь Петрович", dob: "02.02.1960", phone: "+7 900 123-45-67", repFio: "", phone2: "+7 912 555-44-33" };

async function booked() {
  const s = await seedClinic(sql);
  const sms = capture();
  const deps = { sms, clock, pepper: "t", genCode: () => "2604", siteUrl: "https://zapis.example.ru" };
  const r = await startBooking(sql, deps, { serviceId: s.consultId, doctorId: s.doctorId, startsAt: localTime("2026-09-17", 600), who: "other", form: other, consentPd: true, consentPrepay: true, payChoice: "reserve" });
  if (!r.ok) throw new Error("не записались");
  await confirmBookingCode(sql, deps, { token: r.token, code: "2604" });
  const link = sms.sent.find(m => m.phone === "+79125554433")!.text;
  const consentToken = /soglasie\/([\w-]+)/.exec(link)![1]!;
  return { s, token: r.token, consentToken };
}

describe("согласие пациента по ссылке", () => {
  it("страница показывает запись без лишних персональных данных записавшего", async () => {
    const { consentToken } = await booked();
    const v = (await consentView(sql, clock, consentToken))!;
    expect(v).toMatchObject({ state: "pending", patient: "Смирнов Игорь Петрович", doctor: "Жаворонкова А. А.", service: "Консультация кардиолога",
      when: "чт, 17 сентября, 10:00", recorderPhone: "+7 900 ***-**-67" });
    expect(v.consent.title).toBe("Согласие на обработку персональных данных");
    expect(await consentView(sql, clock, "нет-такого")).toBeNull();
  });

  it("согласие фиксирует редакцию, IP и браузер; записавшему — СМС; повтор безвреден", async () => {
    const { consentToken, token } = await booked();
    expect(await givePatientConsent(sql, clock, { token: consentToken, ip: "10.0.0.7", userAgent: "UA" })).toEqual({ ok: true });
    const [b] = await sql<{ patientConsentAt: Date; patientConsentId: number; patientConsentIp: string; patientConsentUa: string }[]>`
      select patient_consent_at, patient_consent_id, host(patient_consent_ip) as patient_consent_ip, patient_consent_ua from bookings where token = ${token}`;
    expect(b).toMatchObject({ patientConsentAt: now, patientConsentIp: "10.0.0.7", patientConsentUa: "UA" });
    expect(b!.patientConsentId).toBeGreaterThan(0);
    const sms = await sql<{ recipient: string; template: string }[]>`select recipient, template from notifications where template = 'booking_consent_given'`;
    expect(sms).toEqual([{ recipient: "+79001234567", template: "booking_consent_given" }]);
    expect(await givePatientConsent(sql, clock, { token: consentToken })).toEqual({ ok: true });
    expect((await consentView(sql, clock, consentToken))!.state).toBe("given");
    expect(await sql`select 1 from notifications where template = 'booking_consent_given'`).toHaveLength(1);
  });

  it("перенос уносит ссылку на согласие с собой; отменённая запись согласия не принимает", async () => {
    const { s, token, consentToken } = await booked();
    const moved = await transferBooking(sql, clock, { token, doctorId: s.doctorId, startsAt: localTime("2026-09-18", 600), actor: "patient" });
    expect((await consentView(sql, clock, consentToken))!.when).toBe("пт, 18 сентября, 10:00");
    await cancelBooking(sql, clock, { token: moved.newToken, actor: "patient" });
    expect((await consentView(sql, clock, consentToken))!.state).toBe("closed");
    expect(await givePatientConsent(sql, clock, { token: consentToken })).toEqual({ ok: false, error: "Запись отменена или уже прошла" });
  });
});
