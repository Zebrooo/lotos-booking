import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { testDb, truncateAll } from "./helpers";
import type { Sql } from "@/lib/db/client";
import { seedDemoV2 } from "../../scripts/seed-demo-v2.ts";
import { listDoctorCards } from "@/lib/queries/doctors";
import { doctorCalendar } from "@/lib/queries/doctor-calendar";

let sql: Sql;
beforeAll(() => { sql = testDb(); });
afterAll(async () => { await sql.end(); });
beforeEach(async () => { await truncateAll(sql); });

const now = new Date("2026-09-24T09:20:00Z"); // чт 14:20 по Челябинску
const clock = { now: () => now };

describe("doctorCalendar", () => {
  it("дни до 31 декабря; воскресенье — выходной; суббота Гришина — группа; сетка с занятыми", async () => {
    await seedDemoV2(sql, now, { staffPassword: "x" });
    const gr = (await listDoctorCards(sql, clock)).find(c => c.surname === "Гришин")!;
    const cal = await doctorCalendar(sql, clock, { doctorId: gr.id, serviceId: gr.services[0]!.id });
    expect(cal.today).toBe("2026-09-24");
    expect(cal.openUntil).toBe("2026-12-31");
    expect(cal.days).toHaveLength(99);
    const byDay = Object.fromEntries(cal.days.map(d => [d.day, d]));
    expect(byDay["2026-09-27"]).toMatchObject({ off: true, group: false, slots: [] });
    expect(byDay["2026-09-26"]!.group).toBe(true);
    // Сегодня после 14:20 + час: первое окно 15:30 (шаг 30 от 09:00), 14:30 занято, но уже в прошлом.
    expect(byDay["2026-09-24"]!.slots[0]).toEqual([930, 0]);
    // Завтра у Гришина занято 09:00, 10:30, 13:00 и 14:00.
    expect(byDay["2026-09-25"]!.slots.filter(s => s[1] === 1).map(s => s[0])).toEqual([540, 630, 780, 840]);
  });
});
