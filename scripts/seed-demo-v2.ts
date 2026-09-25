// Демо-клиника v2 по прототипу «Лотос v2»: врачи, услуги и цены из дизайна,
// записи CRM на сегодня и завтра, поступления для сверки, кабинет пациентки
// с дочерью, документы, платежи и сотрудники трёх ролей. Даты — от «сейчас».
// Все люди вымышленные. Повторный запуск ничего не меняет.
//
// Запуск: DATABASE_URL=… node scripts/seed-demo-v2.ts [пароль сотрудников]
import postgres, { type Sql } from "postgres";
import { hash } from "@node-rs/argon2";
import { randomBytes } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { localDay, localTime, addDays, weekday, type IsoDay } from "../src/domain/time.ts";

type Svc = { key: string; name: string; dur: number; price: number; prep?: string; device?: boolean; kind?: string };
type Doc = { key: string; name: string; spec: string; exp: string; room: string; services: Svc[] };

const DOCTORS: Doc[] = [
  { key: "zh", name: "Жаворонкова Елена Викторовна", spec: "Кардиолог", exp: "Стаж 18 лет · высшая категория", room: "204", services: [
    { key: "zh1", name: "Консультация кардиолога", dur: 30, price: 1800 },
    { key: "zh2", name: "УЗИ сердца (ЭхоКГ)", dur: 40, price: 2600, device: true, kind: "ultrasound", prep: "Специальной подготовки не нужно. Возьмите ЭКГ и заключения прошлых исследований, если есть." }] },
  { key: "ms", name: "Морозов Сергей Андреевич", spec: "Терапевт", exp: "Стаж 11 лет", room: "101", services: [
    { key: "ms1", name: "Консультация терапевта", dur: 20, price: 1300 },
    { key: "ms2", name: "Повторная консультация", dur: 20, price: 900 }] },
  { key: "kl", name: "Климова Ирина Олеговна", spec: "Эндокринолог", exp: "Стаж 14 лет · к.м.н.", room: "206", services: [
    { key: "kl1", name: "Консультация эндокринолога", dur: 30, price: 1900 },
    { key: "kl2", name: "УЗИ щитовидной железы", dur: 30, price: 1500, device: true, kind: "ultrasound", prep: "Подготовка не нужна. Возьмите результаты анализов на гормоны щитовидной железы, если сдавали." }] },
  { key: "bt", name: "Белова Татьяна Николаевна", spec: "Терапевт", exp: "Стаж 22 года", room: "103", services: [
    { key: "bt1", name: "Консультация терапевта", dur: 20, price: 1300 }] },
  { key: "gr", name: "Гришин Павел Игоревич", spec: "Невролог", exp: "Стаж 9 лет", room: "108", services: [
    { key: "gr1", name: "Консультация невролога", dur: 30, price: 1700 }] },
  { key: "sv", name: "Соколова Вера Михайловна", spec: "Гинеколог", exp: "Стаж 16 лет", room: "210", services: [
    { key: "sv1", name: "Консультация гинеколога", dur: 30, price: 1800 },
    { key: "sv2", name: "УЗИ органов малого таза", dur: 30, price: 1700, device: true, kind: "ultrasound", prep: "Исследование проводят на 5–7 день цикла. За час до приёма выпейте 1 литр воды." }] },
  { key: "ld", name: "Лебедев Дмитрий Юрьевич", spec: "Уролог", exp: "Стаж 12 лет", room: "212", services: [
    { key: "ld1", name: "Консультация уролога", dur: 30, price: 1700 }] },
  { key: "nk", name: "Никитина Ольга Сергеевна", spec: "Оториноларинголог", exp: "Стаж 8 лет", room: "105", services: [
    { key: "nk1", name: "Консультация ЛОР-врача", dur: 20, price: 1500 }] },
  { key: "fe", name: "Фёдоров Алексей Викторович", spec: "Офтальмолог", exp: "Стаж 19 лет", room: "110", services: [
    { key: "fe1", name: "Консультация офтальмолога", dur: 30, price: 1600 }] },
  { key: "tr", name: "Тарасова Марина Петровна", spec: "Кардиолог", exp: "Стаж 7 лет", room: "205", services: [
    { key: "tr1", name: "Консультация кардиолога", dur: 30, price: 1600 },
    { key: "tr2", name: "Суточное мониторирование ЭКГ", dur: 20, price: 2400, kind: "diagnostics" }] },
  { key: "ks", name: "Кузнецова Анна Дмитриевна", spec: "Невролог", exp: "Стаж 13 лет", room: "109", services: [
    { key: "ks1", name: "Консультация невролога", dur: 30, price: 1700 }] },
  { key: "pv", name: "Павлов Игорь Николаевич", spec: "Эндокринолог", exp: "Стаж 10 лет", room: "207", services: [
    { key: "pv1", name: "Консультация эндокринолога", dur: 30, price: 1800 }] },
];

const LAB: Svc = { key: "lab1", name: "Анализы крови: липидный профиль, ОАК", dur: 10, price: 1250, kind: "analysis",
  prep: "Натощак, утром: последний приём пищи за 8–12 часов, воду пить можно." };

const e164 = (p: string) => "+" + p.replace(/\D/g, "");
const isoDob = (d: string) => `${d.slice(6)}-${d.slice(3, 5)}-${d.slice(0, 2)}`;
const token = () => randomBytes(16).toString("base64url").slice(0, 21);

export async function seedDemoV2(sql: Sql, now: Date, opts: { staffPassword: string }): Promise<{ created: boolean }> {
  const [exists] = await sql`select 1 from resources limit 1`;
  if (exists) return { created: false };
  const today = localDay(now);
  // Ближайший рабочий день (не воскресенье) начиная с d.
  const workday = (d: IsoDay) => (weekday(d) === 7 ? addDays(d, 1) : d);
  const d0 = workday(today);
  const d1 = workday(addDays(d0, 1));
  const at = (day: IsoDay, h: number, m = 0) => localTime(day, h * 60 + m);

  await sql.begin(async tx => {
    await tx`update settings set pay_model = 'both', horizon_days = 100, slot_step_min = null, free_cancel_hours = 0,
      booking_open_until = ${`${today.slice(0, 4)}-12-31`} where id = 1`;

    // ── Врачи, услуги, графики ────────────────────────────────────────────
    const doc: Record<string, number> = {};
    const svc: Record<string, { id: number; title: string; dur: number; price: number }> = {};
    const [device] = await tx<{ id: number }[]>`insert into resources (kind, title) values ('device', 'Аппарат УЗИ') returning id`;
    const [labRoom] = await tx<{ id: number }[]>`insert into resources (kind, title, room) values ('room', 'Процедурный кабинет', '102') returning id`;
    for (const d of DOCTORS) {
      const [r] = await tx<{ id: number }[]>`insert into resources (kind, title, specialty, experience, room)
        values ('doctor', ${d.name}, ${d.spec}, ${d.exp}, ${d.room}) returning id`;
      doc[d.key] = r!.id;
      for (const wd of [1, 2, 3, 4, 5]) await tx`insert into schedule_rules (resource_id, weekday, from_min, to_min) values (${r!.id}, ${wd}, 540, 1020)`;
      await tx`insert into schedule_rules (resource_id, weekday, from_min, to_min) values (${r!.id}, 6, 540, 780)`;
      for (const s of d.services) {
        const [row] = await tx<{ id: number }[]>`insert into services (title, kind, duration_min, price_kopecks, prepay_kopecks, prep_note)
          values (${s.name}, ${s.kind ?? "consultation"}, ${s.dur}, ${s.price * 100}, 40000, ${s.prep ?? null}) returning id`;
        svc[s.key] = { id: row!.id, title: s.name, dur: s.dur, price: s.price };
        await tx`insert into service_resources (service_id, resource_id) values (${row!.id}, ${r!.id})`;
        if (s.device) await tx`insert into service_resources (service_id, resource_id) values (${row!.id}, ${device!.id})`;
      }
    }
    const [labSvc] = await tx<{ id: number }[]>`insert into services (title, kind, duration_min, price_kopecks, prepay_kopecks, prep_note, active)
      values (${LAB.name}, 'analysis', ${LAB.dur}, ${LAB.price * 100}, 40000, ${LAB.prep!}, false) returning id`;
    svc.lab1 = { id: labSvc!.id, title: LAB.name, dur: LAB.dur, price: LAB.price };
    await tx`insert into service_resources (service_id, resource_id) values (${labSvc!.id}, ${labRoom!.id})`;

    // Групповой день Гришина — первая суббота после «завтра», решение накануне в 12:00.
    let sat = addDays(d1, 1);
    while (weekday(sat) !== 6) sat = addDays(sat, 1);
    await tx`insert into group_days (resource_id, day, min_patients, decide_at) values (${doc.gr!}, ${sat}, 4, ${at(addDays(sat, -1), 12)})`;

    // Квота сайта — как в прототипе CRM, по дням недели «сегодня» и «завтра».
    const QUOTA: [string, IsoDay, number, number, number][] = [
      ["zh", d0, 12, 0, 30], ["zh", d0, 12, 30, 30], ["ms", d0, 13, 0, 20], ["ms", d0, 13, 20, 20], ["kl", d0, 14, 0, 30],
      ["gr", d0, 15, 30, 30], ["sv", d0, 13, 0, 30], ["nk", d0, 11, 0, 20], ["zh", d1, 12, 0, 30], ["ms", d1, 11, 0, 20], ["kl", d1, 14, 0, 30]];
    for (const [k, day, h, m, dur] of QUOTA) {
      await tx`insert into site_quota (resource_id, weekday, from_min, to_min) values (${doc[k]!}, ${weekday(day)}, ${h * 60 + m}, ${h * 60 + m + dur})`;
    }

    // Согласия — черновики.
    const [pd] = await tx<{ id: number }[]>`insert into consents (kind, version, body, published_at) values ('personal_data', 1,
      ${"ЧЕРНОВИК. Текст утверждает юрист клиники.\n\nЯ даю согласие ООО «ЦКЗ Лотос» на обработку моих персональных данных и данных лица, которое я записываю: фамилии, имени, отчества, даты рождения и телефона. Цель обработки — запись на приём, напоминания о нём, выдача кассовых чеков и возврат предоплаты. Данные хранятся на серверах в России. Согласие действует до достижения цели обработки и может быть отозвано письменным заявлением в клинику."},
      ${`${today.slice(0, 4)}-09-01`}) returning id`;
    const [pt] = await tx<{ id: number }[]>`insert into consents (kind, version, body, published_at) values ('prepay_terms', 1,
      ${"ЧЕРНОВИК. Текст утверждает юрист клиники.\n\nЗапись подтверждается предоплатой 400 рублей; она засчитывается в стоимость приёма, кассовый чек приходит в СМС. Отменить запись можно в любой момент; при отмене предоплата возвращается на карту, с которой была оплата. При бронировании время закрепляется до указанного срока; если не оплатить в срок, запись снимается."},
      ${`${today.slice(0, 4)}-09-01`}) returning id`;

    // ── Записи ────────────────────────────────────────────────────────────
    let payN = 88100;
    const book = async (b: {
      doc: string; svc: string; day: IsoDay; h: number; m: number; patient: string; dob: string; phone: string;
      src: "site" | "phone" | "desk"; status: string; paid?: "cash" | "online" | null; settle?: boolean; deadline?: Date;
      claim?: string; recorder?: { relation: "child" | "relative"; name: string }; createdAt?: Date; cancel?: { by: "patient" | "clinic"; reason: string; refunded: boolean };
      resourceId?: number;
    }) => {
      const s = svc[b.svc]!;
      const [p] = await tx<{ id: number }[]>`insert into patients (full_name, birth_date, phone, email)
        values (${b.patient}, ${isoDob(b.dob)}, ${e164(b.phone)}, '') on conflict (phone, birth_date) do update set full_name = excluded.full_name returning id`;
      const startsAt = at(b.day, b.h, b.m);
      const endsAt = new Date(startsAt.getTime() + s.dur * 60_000);
      const createdAt = b.createdAt ?? new Date(startsAt.getTime() - 2 * 86400_000);
      const paidAt = b.paid ? new Date(Math.min(createdAt.getTime() + 600_000, now.getTime())) : null;
      const resourceId = b.resourceId ?? doc[b.doc]!;
      const [bk] = await tx<{ id: number }[]>`insert into bookings (token, patient_id, service_id, service, resource_id, starts_at, ends_at,
          status, hold_until, paid_at, source, booker_relation, booker_name, booker_phone, pay_mode, pay_deadline, phone_verified_at,
          claim_note, cancelled_by, cancelled_at, cancel_reason, created_at)
        values (${token()}, ${p!.id}, ${s.id}, ${tx.json({ title: s.title, kind: "consultation", durationMin: s.dur, priceKopecks: s.price * 100, prepayKopecks: 40000 })},
          ${resourceId}, ${startsAt}, ${endsAt}, ${b.status}, null, ${paidAt}, ${b.src},
          ${b.recorder?.relation ?? "self"}, ${b.recorder?.name ?? null}, ${b.recorder ? e164(b.phone) : null},
          ${b.deadline ? "reserve" : "online"}, ${b.deadline ?? null}, ${b.src === "site" ? createdAt : null},
          ${b.claim ?? null}, ${b.cancel?.by ?? null}, ${b.cancel ? createdAt : null}, ${b.cancel?.reason ?? null}, ${createdAt}) returning id`;
      const live = ["pending", "claimed", "confirmed", "arrived"].includes(b.status);
      if (live) await tx`insert into booking_resources (booking_id, resource_id, starts_at, ends_at) values (${bk!.id}, ${resourceId}, ${startsAt}, ${endsAt})`;
      if (b.src === "site") {
        await tx`insert into booking_consents (booking_id, consent_id, accepted_at) values (${bk!.id}, ${pd!.id}, ${createdAt}), (${bk!.id}, ${pt!.id}, ${createdAt})`;
      }
      if (b.paid) {
        let paymentId: number | null = null;
        let detail = "Наличные · касса · чек аванса";
        if (b.paid === "online") {
          const ext = `CHB-${payN++}`;
          const [pay] = await tx<{ id: number }[]>`insert into payments (booking_id, provider, external_id, amount_kopecks, status, paid_at, created_at)
            values (${bk!.id}, 'fake', ${ext}, 40000, 'paid', ${paidAt}, ${createdAt}) returning id`;
          paymentId = pay!.id;
          detail = `Онлайн · ${ext} · чек аванса`;
        }
        const [l] = await tx<{ id: number }[]>`insert into ledger (booking_id, kind, amount_kopecks, payment_id, channel, detail, created_at)
          values (${bk!.id}, 'advance', 40000, ${paymentId}, ${b.paid}, ${detail}, ${paidAt}) returning id`;
        await tx`insert into receipts (booking_id, kind, ledger_id, amount_kopecks, phone, provider, status, attempts)
          values (${bk!.id}, 'advance', ${l!.id}, 40000, ${e164(b.phone)}, 'log', 'sent', 1)`;
        if (b.settle) {
          await tx`insert into ledger (booking_id, kind, amount_kopecks, channel, detail, created_at)
            values (${bk!.id}, 'settle', 40000, 'manual', 'чек при оказании услуги', ${startsAt})`;
        }
        if (b.status === "no_show") await tx`insert into ledger (booking_id, kind, amount_kopecks, channel, detail) values (${bk!.id}, 'retain', 40000, 'manual', 'неявка')`;
        if (b.cancel?.refunded) {
          const [rl] = await tx<{ id: number }[]>`insert into ledger (booking_id, kind, amount_kopecks, payment_id, channel, detail, created_at)
            values (${bk!.id}, 'refund', 40000, ${paymentId}, ${b.paid}, 'на карту', ${createdAt}) returning id`;
          await tx`insert into receipts (booking_id, kind, ledger_id, amount_kopecks, phone, provider, status, attempts)
            values (${bk!.id}, 'refund', ${rl!.id}, 40000, ${e164(b.phone)}, 'log', 'sent', 1)`;
        }
      }
      return { id: bk!.id, patientId: p!.id };
    };

    const cash = "cash" as const, online = "online" as const;
    const dl0 = at(d0, 17);
    const T: Parameters<typeof book>[0][] = [
      { doc: "zh", svc: "zh1", day: d0, h: 9, m: 0, patient: "Кравцова Ольга Викторовна", dob: "12.03.1968", phone: "+7 912 441-20-17", src: "phone", status: "done", paid: cash, settle: true },
      { doc: "zh", svc: "zh2", day: d0, h: 9, m: 40, patient: "Шевчук Андрей Павлович", dob: "04.11.1959", phone: "+7 904 118-33-05", src: "site", status: "done", paid: online, settle: true },
      { doc: "zh", svc: "zh1", day: d0, h: 11, m: 0, patient: "Лапина Светлана Игоревна", dob: "29.06.1975", phone: "+7 951 780-11-42", src: "site", status: "arrived", paid: online },
      { doc: "zh", svc: "zh2", day: d0, h: 14, m: 0, patient: "Орлов Виктор Семёнович", dob: "17.01.1962", phone: "+7 922 305-64-90", src: "phone", status: "no_show", paid: cash },
      { doc: "zh", svc: "zh1", day: d0, h: 15, m: 30, patient: "Гаврилова Нина Петровна", dob: "08.08.1981", phone: "+7 908 562-77-13", src: "site", status: "claimed", deadline: dl0, claim: "Пациент сообщил об оплате в 13:52" },
      { doc: "zh", svc: "zh1", day: d0, h: 16, m: 10, patient: "Юсупов Ринат Маратович", dob: "21.02.1990", phone: "+7 919 004-38-61", src: "site", status: "pending", deadline: dl0 },
      { doc: "ms", svc: "ms1", day: d0, h: 9, m: 0, patient: "Соловьёва Мария Андреевна", dob: "15.05.1993", phone: "+7 950 227-19-84", src: "desk", status: "done", paid: cash, settle: true },
      { doc: "ms", svc: "ms1", day: d0, h: 10, m: 0, patient: "Петров Иван Сергеевич", dob: "02.09.2016", phone: "+7 912 660-05-72", src: "site", status: "done", paid: online, settle: true, recorder: { relation: "child", name: "Петрова Анна Викторовна, мать" } },
      { doc: "ms", svc: "ms2", day: d0, h: 12, m: 20, patient: "Зайцев Олег Николаевич", dob: "30.10.1970", phone: "+7 902 871-40-26", src: "phone", status: "confirmed", paid: cash },
      { doc: "ms", svc: "ms1", day: d0, h: 15, m: 0, patient: "Белоусова Кира Денисовна", dob: "11.12.1988", phone: "+7 961 330-52-08", src: "site", status: "pending", deadline: dl0 },
      { doc: "kl", svc: "kl1", day: d0, h: 9, m: 30, patient: "Ильина Татьяна Олеговна", dob: "19.04.1979", phone: "+7 912 088-61-33", src: "phone", status: "done", paid: cash, settle: true },
      { doc: "kl", svc: "kl2", day: d0, h: 13, m: 0, patient: "Мухаметова Алсу Рашитовна", dob: "07.07.1985", phone: "+7 908 045-17-92", src: "site", status: "confirmed", paid: online },
      { doc: "kl", svc: "kl1", day: d0, h: 16, m: 0, patient: "Горелов Денис Юрьевич", dob: "25.03.1996", phone: "+7 951 912-73-40", src: "site", status: "claimed", deadline: dl0, claim: "Пациент сообщил об оплате в 11:47" },
      { doc: "gr", svc: "gr1", day: d0, h: 10, m: 0, patient: "Никифорова Елена Андреевна", dob: "13.02.1972", phone: "+7 904 509-26-81", src: "phone", status: "done", paid: cash, settle: true },
      { doc: "gr", svc: "gr1", day: d0, h: 14, m: 30, patient: "Тимофеев Роман Алексеевич", dob: "05.06.1983", phone: "+7 922 713-08-55", src: "site", status: "confirmed", paid: online },
      { doc: "sv", svc: "sv2", day: d0, h: 11, m: 30, patient: "Королёва Дарья Павловна", dob: "18.09.1991", phone: "+7 919 227-64-19", src: "site", status: "confirmed", paid: online },
      { doc: "sv", svc: "sv1", day: d0, h: 15, m: 0, patient: "Васильева Инна Геннадьевна", dob: "27.11.1969", phone: "+7 950 682-15-37", src: "phone", status: "pending", deadline: dl0 },
      { doc: "nk", svc: "nk1", day: d0, h: 9, m: 20, patient: "Андреев Максим Ильич", dob: "09.01.2011", phone: "+7 912 553-40-78", src: "site", status: "done", paid: online, settle: true, recorder: { relation: "child", name: "Андреева Юлия Сергеевна, мать" } },
      { doc: "zh", svc: "zh1", day: d1, h: 9, m: 0, patient: "Ефимова Валентина Ивановна", dob: "03.05.1955", phone: "+7 902 117-82-64", src: "phone", status: "confirmed", paid: cash },
      { doc: "zh", svc: "zh2", day: d1, h: 10, m: 0, patient: "Мельников Артём Олегович", dob: "22.08.1987", phone: "+7 961 402-73-18", src: "site", status: "confirmed", paid: online },
      { doc: "gr", svc: "gr1", day: d1, h: 9, m: 0, patient: "Сафронова Ирина Львовна", dob: "14.10.1977", phone: "+7 908 330-29-47", src: "site", status: "confirmed", paid: online },
      { doc: "gr", svc: "gr1", day: d1, h: 10, m: 30, patient: "Дмитриев Кирилл Андреевич", dob: "01.03.1994", phone: "+7 951 604-88-12", src: "phone", status: "confirmed", paid: cash },
      { doc: "gr", svc: "gr1", day: d1, h: 13, m: 0, patient: "Хасанова Лилия Ринатовна", dob: "26.12.1980", phone: "+7 919 781-05-36", src: "site", status: "pending", deadline: dl0 },
      { doc: "gr", svc: "gr1", day: d1, h: 14, m: 0, patient: "Воронин Павел Сергеевич", dob: "10.07.1965", phone: "+7 912 245-90-63", src: "site", status: "confirmed", paid: online },
      { doc: "kl", svc: "kl2", day: d1, h: 11, m: 0, patient: "Широкова Анна Михайловна", dob: "16.02.1983", phone: "+7 904 873-11-50", src: "site", status: "confirmed", paid: online },
      { doc: "nk", svc: "nk1", day: d1, h: 12, m: 0, patient: "Лукин Семён Витальевич", dob: "30.04.1999", phone: "+7 950 136-42-87", src: "site", status: "confirmed", paid: online },
      { doc: "nk", svc: "nk1", day: d1, h: 12, m: 20, patient: "Абрамова Вера Сергеевна", dob: "12.12.1974", phone: "+7 922 018-57-39", src: "phone", status: "confirmed", paid: cash },
      // Групповой день Гришина: двое из четырёх.
      { doc: "gr", svc: "gr1", day: sat, h: 10, m: 0, patient: "Мельникова Ксения Андреевна", dob: "11.05.1990", phone: "+7 950 411-22-83", src: "site", status: "confirmed", paid: online },
      { doc: "gr", svc: "gr1", day: sat, h: 10, m: 30, patient: "Карпов Евгений Олегович", dob: "23.01.1985", phone: "+7 902 553-18-04", src: "site", status: "confirmed", paid: online },
    ];
    // В субботу приём 9–13: записи, которые туда не помещаются, пропускаем.
    const fits = (b: (typeof T)[number]) => weekday(b.day) !== 6 || b.h * 60 + b.m + svc[b.svc]!.dur <= 13 * 60;
    for (const b of T.filter(fits)) await book(b);

    // Поступления из банка, ещё не сопоставленные.
    const inc: [Date, string, string][] = [
      [at(today, 11, 46), "900: Зачисление 400р от ГОРЕЛОВ Д.Ю. Баланс …", "sms"],
      [at(today, 13, 51), "900: Зачисление 400р от НИНА ПЕТРОВНА Г. Баланс …", "sms"],
      [at(today, 14, 5), "Эквайринг: оплата 400.00 RUB, карта *4417, без назначения", "acquiring"],
    ];
    for (const [t, text, source] of inc) await tx`insert into bank_incoming (received_at, amount_kopecks, text, source) values (${t}, 40000, ${text}, ${source})`;

    // ── Кабинет: Смирнова Елена и дочь Маша ────────────────────────────────
    const me = { patient: "Смирнова Елена Андреевна", dob: "14.03.1988", phone: "+7 900 123-45-67" };
    const masha = { patient: "Смирнова Мария Игоревна", dob: "02.06.2017", phone: "+7 900 123-45-67", recorder: { relation: "child" as const, name: "Смирнова Елена Андреевна" } };
    const day = (n: number) => addDays(today, n);
    const v2 = await book({ ...masha, doc: "fe", svc: "fe1", day: workday(day(2)), h: 10, m: 30, src: "site", status: "pending", deadline: dl0, createdAt: now });
    const v1 = await book({ ...me, doc: "zh", svc: "zh2", day: workday(day(8)), h: 10, m: 0, src: "site", status: "confirmed", paid: online, createdAt: now });
    const v3 = await book({ ...me, doc: "tr", svc: "tr2", day: day(-1), h: 9, m: 0, src: "site", status: "done", paid: cash, settle: true });
    const v5 = await book({ ...me, doc: "", resourceId: labRoom!.id, svc: "lab1", day: day(-11), h: 8, m: 20, src: "desk", status: "done", paid: cash, settle: true });
    const v4 = await book({ ...me, doc: "zh", svc: "zh1", day: day(-12), h: 11, m: 0, src: "site", status: "done", paid: online, settle: true });
    const v6 = await book({ ...masha, doc: "nk", svc: "nk1", day: day(-27), h: 16, m: 0, src: "phone", status: "done", paid: cash, settle: true });
    await book({ ...me, doc: "kl", svc: "kl1", day: day(-40), h: 13, m: 30, src: "site", status: "cancelled", paid: online, cancel: { by: "patient", reason: "по просьбе пациента", refunded: true } });
    const v8 = await book({ ...me, doc: "ms", svc: "ms1", day: day(-83), h: 10, m: 20, src: "phone", status: "done", paid: cash, settle: true });
    void v2; void v1;

    await tx`insert into patient_accounts (phone, email) values (${e164(me.phone)}, null) on conflict do nothing`;
    const docRow = async (b: { id: number; patientId: number }, kind: string, title: string, author: string, issued: IsoDay, body: object, readyOn?: IsoDay, read = false) => {
      const [d] = await tx<{ id: number }[]>`insert into medical_documents (patient_id, booking_id, kind, title, author, issued_on, ready_on, body)
        values (${b.patientId}, ${b.id}, ${kind}, ${title}, ${author}, ${issued}, ${readyOn ?? null}, ${tx.json(body as never)}) returning id`;
      if (read) await tx`insert into document_reads (document_id, phone) values (${d!.id}, ${e164(me.phone)})`;
    };
    await docRow(v4, "concl", "Заключение кардиолога", "Жаворонкова Е. В.", day(-12), {
      sections: [["Жалобы", "Давящие боли за грудиной при подъёме по лестнице, одышка при быстрой ходьбе."], ["Давление на приёме", "148/92 мм рт. ст., пульс 78"], ["Заключение", "Артериальная гипертензия. Нужны анализы и УЗИ сердца для уточнения."]],
      recs: ["Сдать липидный профиль и общий анализ крови", "Сделать УЗИ сердца (ЭхоКГ) в течение месяца", "Измерять давление утром и вечером, вести дневник", "Повторный приём через 3–4 недели с результатами"],
      next: { text: "Повторный приём до 15 октября", doctorId: doc.zh, serviceId: svc.zh1!.id } });
    await docRow(v5, "lab", "Липидный профиль", "Лаборатория «Лотос»", day(-11), {
      rows: [["Холестерин общий", "5,9", "ммоль/л", "3,0–5,2", 1], ["ЛПНП", "3,6", "ммоль/л", "до 3,0", 1], ["ЛПВП", "1,3", "ммоль/л", "от 1,2", 0], ["Триглицериды", "1,4", "ммоль/л", "до 1,7", 0]] });
    await docRow(v5, "lab", "Общий анализ крови", "Лаборатория «Лотос»", day(-11), {
      rows: [["Гемоглобин", "132", "г/л", "120–140", 0], ["Эритроциты", "4,4", "×10¹²/л", "3,8–5,1", 0], ["Лейкоциты", "6,1", "×10⁹/л", "4,0–9,0", 0], ["Тромбоциты", "248", "×10⁹/л", "180–320", 0], ["СОЭ", "9", "мм/ч", "2–15", 0]] }, undefined, true);
    await docRow(v3, "study", "Суточное мониторирование ЭКГ", "Тарасова М. П.", day(-1), {}, day(2));
    await docRow(v6, "concl", "Заключение ЛОР-врача", "Никитина О. С.", day(-27), {
      sections: [["Жалобы", "Заложенность носа, храп по ночам две недели."], ["Заключение", "Острый ринит."]],
      recs: ["Промывать нос солевым раствором 3 раза в день", "Контрольный осмотр через 10 дней, если жалобы останутся"] }, undefined, true);
    await docRow(v8, "concl", "Заключение терапевта", "Морозов С. А.", day(-83), {
      sections: [["Жалобы", "Повышенная утомляемость, эпизоды головной боли."], ["Давление на приёме", "142/88 мм рт. ст."]],
      recs: ["Консультация кардиолога", "Ограничить соль; кофе — не больше двух чашек в день"] }, undefined, true);

    // ── Сотрудники ────────────────────────────────────────────────────────
    const pw = await hash(opts.staffPassword);
    await tx`insert into admins (email, password_hash, role, full_name) values
      ('admin@lotos.demo', ${pw}, 'admin', 'Сидорова К. В.'), ('senior@lotos.demo', ${pw}, 'senior', 'Горбунова Л. А.')`;
    await tx`insert into admins (email, password_hash, role, full_name, resource_id) values ('grishin@lotos.demo', ${pw}, 'doctor', 'Гришин Павел Игоревич', ${doc.gr!})`;
  });
  return { created: true };
}

const isMain = process.argv[1] ? path.resolve(process.argv[1]) === fileURLToPath(import.meta.url) : false;
if (isMain) {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("DATABASE_URL не задан");
    process.exit(1);
  }
  const password = process.argv[2] || "lotos-demo";
  const sql = postgres(url, { max: 1, onnotice: () => {} });
  try {
    const r = await seedDemoV2(sql, new Date(), { staffPassword: password });
    console.log(r.created
      ? `демо-клиника v2 создана. Вход в CRM: admin@lotos.demo, senior@lotos.demo, grishin@lotos.demo — пароль «${password}». Кабинет пациента: +7 900 123-45-67.`
      : "демо-данные уже есть, пропуск");
  } finally {
    await sql.end();
  }
}
