import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { testDb, truncateAll } from "./helpers";
import type { Sql } from "@/lib/db/client";
import { getLatestConsent } from "@/lib/queries/consents";

let sql: Sql;
beforeAll(() => { sql = testDb(); });
afterAll(async () => { await sql.end(); });
beforeEach(async () => { await truncateAll(sql); });

describe("getLatestConsent", () => {
  it("последняя редакция нужного вида; нет текста — null", async () => {
    expect(await getLatestConsent(sql, "personal_data")).toBeNull();
    await sql`insert into consents (kind, version, body) values ('personal_data', 1, 'Р1'), ('personal_data', 2, 'Р2'), ('prepay_terms', 1, 'П1')`;
    expect(await getLatestConsent(sql, "personal_data")).toMatchObject({ version: 2, body: "Р2" });
    expect(await getLatestConsent(sql, "prepay_terms")).toMatchObject({ version: 1, body: "П1" });
  });
});
