import { describe, expect, it } from "vitest";
import { fetchInvitroCatalog } from "./invitro-client";

const product = (id: string, price: number) => ({ id, bitrix_id: 2212, category_bitrix_id: 481, code: "16", title: "Глюкоза", subtitle: "<b>A09.05.023</b><br>Описание", price, deadline: 1, available_at_home: true, additional_services: [] });

describe("каталог INVITRO", () => {
  it("собирает анализы и комплексы постранично и нормализует поля", async () => {
    const urls: string[] = [];
    const fetchImpl = async (url: string | URL | Request) => {
      urls.push(String(url));
      if (String(url).includes("/cities?")) return Response.json({ cities: [{ id: "city-id", slug: "emanjelinsk" }] });
      if (String(url).includes("/tests/?")) {
        const offset = Number(new URL(String(url)).searchParams.get("offset"));
        return Response.json({ total: 3, data: offset === 0 ? [{ category_name: "Биохимия", products: [product("a1", 215), product("a2", 300)] }] : [{ category_name: "Биохимия", products: [product("a3", 400)] }] });
      }
      return Response.json({ total: 1, data: [{ category_name: "Комплексы", products: [{ ...product("c1", 1200), code: "ОБ1" }] }] });
    };
    const result = await fetchInvitroCatalog({ fetchImpl: fetchImpl as typeof fetch, pageSize: 1 });
    expect(result.products).toHaveLength(4);
    expect(result.products[0]).toMatchObject({ externalId: "a1", kind: "analysis", code: "16", category: "Биохимия", priceKopecks: 21500, description: "A09.05.023\nОписание" });
    expect(result.products[3]).toMatchObject({ externalId: "c1", kind: "complex", priceKopecks: 120000 });
    expect(urls.filter(url => url.includes("/tests/?"))).toHaveLength(2);
    expect(result.products[0]!.sourceUrl).toContain("/analizes/for-doctors/emanjelinsk/481/2212/");
  });

  it("не возвращает частичный каталог при ошибке города", async () => {
    const fetchImpl = async () => Response.json({ cities: [] });
    await expect(fetchInvitroCatalog({ fetchImpl: fetchImpl as typeof fetch })).rejects.toThrow("город");
  });
});
