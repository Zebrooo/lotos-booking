export type InvitroProduct = {
  externalId: string;
  bitrixId: number | null;
  kind: "analysis" | "complex";
  code: string;
  title: string;
  category: string;
  description: string;
  priceKopecks: number;
  deadlineDays: number | null;
  availableAtHome: boolean;
  additionalServices: unknown;
  sourceUrl: string;
  payload: unknown;
};

type Product = {
  id: string;
  bitrix_id?: number;
  category_bitrix_id?: number;
  code?: string;
  title: string;
  subtitle?: string;
  price: number;
  deadline?: number;
  available_at_home?: boolean;
  additional_services?: unknown;
  [key: string]: unknown;
};

type Page = {
  total: number;
  data: { category_bitrix_id?: number; category_name?: string; products?: Product[] }[];
};

type Options = {
  citySlug?: string;
  apiOrigin?: string;
  pageSize?: number;
  fetchImpl?: typeof fetch;
  pauseMs?: number;
};

const DEFAULT_ORIGIN = "https://www.invitro.ru/golk";
const USER_AGENT = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36";

const text = (markup = "") => markup
  .replace(/<br\s*\/?>/gi, "\n")
  .replace(/<[^>]+>/g, "")
  .replace(/&nbsp;/g, " ")
  .replace(/&amp;/g, "&")
  .replace(/&quot;/g, '"')
  .replace(/&#39;/g, "'")
  .replace(/\r/g, "")
  .replace(/[ \t]+/g, " ")
  .replace(/\n +/g, "\n")
  .trim();

async function getJson(fetchImpl: typeof fetch, url: string, referer: string) {
  const response = await fetchImpl(url, {
    headers: { accept: "application/json, text/plain, */*", "user-agent": USER_AGENT, web: "true", referer },
    signal: AbortSignal.timeout(20_000),
  });
  if (!response.ok) throw new Error(`INVITRO: HTTP ${response.status} для ${url}`);
  return response.json() as Promise<unknown>;
}

export async function fetchInvitroCatalog(options: Options = {}): Promise<{ citySlug: string; cityExternalId: string; products: InvitroProduct[] }> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const citySlug = options.citySlug ?? "emanjelinsk";
  const origin = (options.apiOrigin ?? DEFAULT_ORIGIN).replace(/\/$/, "");
  const publicOrigin = origin.endsWith("/golk") ? origin.slice(0, -5) : origin;
  const referer = `${publicOrigin}/analizes/for-doctors/${citySlug}/`;
  const cityData = await getJson(fetchImpl, `${origin}/addresses/api/v1/cities?q=${encodeURIComponent(citySlug)}`, referer) as { cities?: { id: string; slug: string }[] };
  const city = cityData.cities?.[0];
  if (!city) throw new Error(`INVITRO: город ${citySlug} не найден`);
  const products: InvitroProduct[] = [];
  const pageSize = options.pageSize ?? 100;

  for (const kind of ["analysis", "complex"] as const) {
    const endpoint = kind === "analysis" ? "tests" : "complexes";
    let offset = 0;
    for (let page = 0; page < 100; page++) {
      const url = `${origin}/tests/api/v1/${endpoint}/?cityID=${encodeURIComponent(city.id)}&limit=${pageSize}&offset=${offset}`;
      const data = await getJson(fetchImpl, url, referer) as Page;
      let received = 0;
      for (const group of data.data ?? []) {
        for (const product of group.products ?? []) {
          if (!product.id || !product.title || !Number.isFinite(product.price)) continue;
          received++;
          products.push({
            externalId: product.id,
            bitrixId: product.bitrix_id ?? null,
            kind,
            code: product.code ?? "",
            title: product.title.trim(),
            category: group.category_name ?? "",
            description: text(product.subtitle),
            priceKopecks: Math.round(product.price * 100),
            deadlineDays: product.deadline ?? null,
            availableAtHome: product.available_at_home === true,
            additionalServices: product.additional_services ?? [],
            sourceUrl: `${publicOrigin}/analizes/${kind === "analysis" ? "for-doctors" : "profi"}/${citySlug}/${product.category_bitrix_id ?? group.category_bitrix_id ?? ""}/${product.bitrix_id ?? ""}/`,
            payload: { ...product, category_name: group.category_name ?? "" },
          });
        }
      }
      offset += received;
      if (received === 0 || offset >= data.total || offset >= 10_000) break;
      if (options.pauseMs) await new Promise(resolve => setTimeout(resolve, options.pauseMs));
    }
  }
  const unique = new Map(products.map(product => [product.externalId, product]));
  return { citySlug, cityExternalId: city.id, products: [...unique.values()] };
}
