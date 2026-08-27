import type { SearchResult } from "../product-search";

const REQUEST_TIMEOUT_MS = 15_000;
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36";

function toNumber(value: unknown) {
  if (value && typeof value === "object" && "price" in (value as object)) {
    const n = Number((value as { price?: unknown }).price);
    return Number.isFinite(n) ? n : 0;
  }
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

/**
 * Direct Ozon parser via the public composer search API. NOTE: Ozon blocks
 * server/datacenter IPs (returns connection errors), so this works only when the
 * bot runs from an unblocked network (your own PC or a proxy) — not on GitHub Actions.
 */
export async function searchOzonDirect(query: string, limit = 10): Promise<SearchResult[]> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(
      `https://www.ozon.ru/api/composer-api.bx/page/json/v2?url=/search/?text=${encodeURIComponent(query)}`,
      {
        headers: { "user-agent": UA, accept: "application/json", "x-o3-app-name": "ozon-app", origin: "https://www.ozon.ru" },
        signal: controller.signal,
      }
    );
    if (!response.ok) return [];
    const json = (await response.json()) as { widgets?: Array<{ data?: Record<string, any> }> };
    const items: Array<Record<string, any>> = [];
    for (const w of json.widgets ?? []) {
      const d = w.data ?? {};
      const arr = d.products ?? d.items ?? d.sku ?? d.searchResultItems ?? [];
      if (Array.isArray(arr)) items.push(...arr);
    }
    return items
      .map((p): SearchResult => {
        const id = String(p.id ?? p.sku ?? "");
        const url = p.url ?? (id ? `https://www.ozon.ru/product/${id}/` : "");
        const price = toNumber(p.price);
        const oldPrice = toNumber(p.old_price ?? p.oldPrice);
        return {
          id: `ozon-${id || Math.random().toString(36).slice(2, 8)}`,
          title: String(p.name ?? p.title ?? "Товар"),
          price,
          oldPrice: oldPrice && oldPrice > price ? oldPrice : null,
          rating: p.rating != null ? Number(p.rating) : null,
          url: String(url),
          source: "Ozon",
          verified: Boolean(url),
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
