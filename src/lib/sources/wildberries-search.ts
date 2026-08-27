import type { SearchResult } from "../product-search";

const REQUEST_TIMEOUT_MS = 15_000;
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36";

function toNumber(value: unknown) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

/**
 * Direct Wildberries parser via the public search API. NOTE: Wildberries blocks
 * server/datacenter IPs (returns 403/404), so this works only from an unblocked
 * network (your own PC or a proxy) — not on GitHub Actions.
 */
export async function searchWildberriesDirect(query: string, limit = 10): Promise<SearchResult[]> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const url =
      `https://search.wb.ru/exactmatch/ru/common/search?appType=1&curr=rub&dest=-1257781` +
      `&resultset=catalog&query=${encodeURIComponent(query)}&suppressSpellcheck=false`;
    const response = await fetch(url, {
      headers: { "user-agent": UA, accept: "application/json", origin: "https://www.wildberries.ru", referer: "https://www.wildberries.ru/" },
      signal: controller.signal,
    });
    if (!response.ok) return [];
    const json = (await response.json()) as { data?: { products?: Array<Record<string, any>> } };
    const products = json.data?.products ?? [];
    return products
      .map((p): SearchResult => {
        const id = String(p.id ?? "");
        const price = toNumber(p.price);
        const oldPrice = toNumber(p.oldPrice);
        return {
          id: `wb-${id}`,
          title: String(p.name ?? p.brand ?? "Товар"),
          price,
          oldPrice: oldPrice && oldPrice > price ? oldPrice : null,
          rating: p.rating != null ? Number(p.rating) : null,
          url: id ? `https://www.wildberries.ru/catalog/${id}/detail.aspx` : "",
          source: "Wildberries",
          verified: Boolean(id),
          verificationStatus: "scrape",
        };
      })
      .filter((r) => r.price > 0 && r.url)
      .slice(0, limit);
  } catch {
    return [];
  } finally {
    clearTimeout(timer);
  }
}
