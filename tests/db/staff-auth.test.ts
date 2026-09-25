import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { hash } from "@node-rs/argon2";
import { testDb, truncateAll } from "./helpers";
import type { Sql } from "@/lib/db/client";
import { staffLogin, staffBySession, endStaffSession, LOCK_MINUTES } from "@/lib/staff/auth";

let sql: Sql;
beforeAll(() => { sql = testDb(); });
afterAll(async () => { await sql.end(); });
beforeEach(async () => { await truncateAll(sql); });

const t0 = new Date("2026-09-24T09:00:00Z");
const at = (min: number) => ({ now: () => new Date(t0.getTime() + min * 60_000) });
async function staff(role: "admin" | "senior" | "doctor" = "admin", active = true) {
  let resourceId: number | null = null;
  if (role === "doctor") {
    const [r] = await sql<{ id: number }[]>`insert into resources (kind, title) values ('doctor', 'Гришин Павел Игоревич') returning id`;
    resourceId = r!.id;
  }
  await sql`insert into admins (email, password_hash, role, full_name, resource_id, active) values ('sidorova@lotos.ru', ${await hash("верный-пароль")}, ${role}, 'Сидорова К. В.', ${resourceId}, ${active})`;
}

describe("вход сотрудников", () => {
  it("верные почта и пароль — сессия с ролью и именем; почта без учёта регистра", async () => {
    await staff("senior");
    const r = await staffLogin(sql, at(0), { email: " Sidorova@Lotos.ru ", password: "верный-пароль" });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(await staffBySession(sql, at(1), r.token)).toMatchObject({ email: "sidorova@lotos.ru", role: "senior", fullName: "Сидорова К. В.", resourceId: null });
    const [row] = await sql<{ tokenHash: string }[]>`select token_hash from staff_sessions`;
    expect(row!.tokenHash).not.toBe(r.token);
  });

  it("неверный пароль и неизвестная почта — одна и та же ошибка", async () => {
    await staff();
    const a = await staffLogin(sql, at(0), { email: "sidorova@lotos.ru", password: "нет" });
    const b = await staffLogin(sql, at(0), { email: "nobody@lotos.ru", password: "нет" });
    expect(a).toEqual({ ok: false, error: "Неверная почта или пароль" });
    expect(b).toEqual(a);
  });

  it("пять неудач подряд закрывают вход на 15 минут даже с верным паролем", async () => {
    await staff();
    for (let i = 0; i < 5; i++) await staffLogin(sql, at(0), { email: "sidorova@lotos.ru", password: "нет" });
    expect(await staffLogin(sql, at(1), { email: "sidorova@lotos.ru", password: "верный-пароль" })).toEqual({ ok: false, error: `Слишком много попыток. Попробуйте через ${LOCK_MINUTES} минут` });
    expect((await staffLogin(sql, at(LOCK_MINUTES + 1), { email: "sidorova@lotos.ru", password: "верный-пароль" })).ok).toBe(true);
  });

  it("отключённый сотрудник не входит, а его старые сессии перестают работать", async () => {
    await staff();
    const r = await staffLogin(sql, at(0), { email: "sidorova@lotos.ru", password: "верный-пароль" });
    if (!r.ok) throw new Error("не вошли");
    await sql`update admins set active = false`;
    expect(await staffBySession(sql, at(1), r.token)).toBeNull();
    expect((await staffLogin(sql, at(2), { email: "sidorova@lotos.ru", password: "верный-пароль" })).ok).toBe(false);
  });

  it("сессия живёт смену (12 часов), выход её удаляет; мусорный токен — null", async () => {
    await staff("doctor");
    const r = await staffLogin(sql, at(0), { email: "sidorova@lotos.ru", password: "верный-пароль" });
    if (!r.ok) throw new Error("не вошли");
    expect(await staffBySession(sql, at(11 * 60), r.token)).toMatchObject({ role: "doctor", resourceId: expect.any(Number) });
    expect(await staffBySession(sql, at(12 * 60 + 1), r.token)).toBeNull();
    const r2 = await staffLogin(sql, at(0), { email: "sidorova@lotos.ru", password: "верный-пароль" });
    if (!r2.ok) throw new Error("не вошли");
    await endStaffSession(sql, r2.token);
    expect(await staffBySession(sql, at(1), r2.token)).toBeNull();
    expect(await staffBySession(sql, at(1), "'; drop table admins; --")).toBeNull();
  });
});
