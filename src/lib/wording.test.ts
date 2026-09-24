// Страж формулировок: условие, что предоплату не отдают назад ни при каких
// обстоятельствах, ничтожно (docs/05-legal.md). В текстах его быть не должно.
import { describe, it, expect } from "vitest";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

const FORBIDDEN = [["не", "возвращается"].join(" "), ["невозврат", "н"].join("")];

async function sources(dir: string): Promise<string[]> {
  const out: string[] = [];
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...(await sources(p)));
    else if (/\.(ts|tsx)$/.test(e.name)) out.push(p);
  }
  return out;
}

describe("формулировки", () => {
  it("в src нет запрещённых формулировок о предоплате", async () => {
    const offenders: string[] = [];
    for (const f of await sources(path.resolve("src"))) {
      const text = (await readFile(f, "utf8")).toLocaleLowerCase("ru");
      for (const w of FORBIDDEN) if (text.includes(w)) offenders.push(`${path.relative(process.cwd(), f)}: «${w}»`);
    }
    expect(offenders).toEqual([]);
  });
});
