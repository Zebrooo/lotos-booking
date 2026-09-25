import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { testDb, truncateAll } from "./helpers";
import type { Sql } from "@/lib/db/client";
import { startPatientSession, phoneBySession, endPatientSession, cabinetOwner, SESSION_DAYS } from "@/lib/cabinet/session";

let sql: Sql;
beforeAll(() => { sql = testDb(); });
afterAll(async () => { await sql.end(); });
beforeEach(async () => { await truncateAll(sql); });

const now = new Date("2026-09-24T09:20:00Z");
const clock = { now: () => now };
const phone = "+79001234567";

describe("сессия кабинета", () => {
  it("токен в cookie, в базе хеш; истекает через 30 дней; выход удаляет", async () => {
    const token = await startPatientSession(sql, clock, phone);
    expect(token.length).toBeGreaterThanOrEqual(40);
    const [row] = await sql<{ tokenHash: string }[]>`select token_hash from patient_sessions`;
    expect(row!.tokenHash).not.toBe(token);
    expect(await phoneBySession(sql, clock, token)).toBe(phone);
    expect(await phoneBySession(sql, { now: () => new Date(now.getTime() + (SESSION_DAYS * 86400 + 1) * 1000) }, token)).toBeNull();
    await endPatientSession(sql, token);
    expect(await phoneBySession(sql, clock, token)).toBeNull();
    expect(await phoneBySession(sql, clock, "мусор")).toBeNull();
  });

  it("владелец кабинета — взрослый пациент с этим телефоном; имя и буква для шапки", async () => {
    await sql`insert into patients (full_name, birth_date, phone, email) values
      ('Смирнова Мария Игоревна', '2017-06-02', ${phone}, ''), ('Смирнова Елена Андреевна', '1988-03-14', ${phone}, '')`;
    expect(await cabinetOwner(sql, clock, phone)).toMatchObject({ fullName: "Смирнова Елена Андреевна", firstName: "Елена", initial: "Е", birthDate: "1988-03-14" });
    expect(await cabinetOwner(sql, clock, "+79990000000")).toBeNull();
  });
});
