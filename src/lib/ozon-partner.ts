import type { SearchResult } from "./product-search";

const OZON_SEARCH_URL = "https://api.ozon.ru/v1/product/search";
const REQUEST_TIMEOUT_MS = 20_000;

function getEnv(name: string) {
  return process.env[name]?.trim() || "";
}

function hasCredentials() {
  return Boolean(getEnv("OZON_PARTNER_CLIENT_ID") && getEnv("OZON_PARTNER_API_KEY"));
}

function toRubles(value: unknown) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return 0;
  // Ozon partner API returns prices in kopecks; divide unless the value is
  // already small enough to be rubles. A price above 1000 is treated as kopecks.
  return n > 1000 ? Math.round(n / 100) : Math.round(n);
}

/**
 * Search Ozon via the official Partner (витрина) API. Free to join at
 * partner.ozon.ru; returns real, structured products with prices — no scraping,
 * so it is not blocked by anti-bot. Requires OZON_PARTNER_CLIENT_ID and
 * OZON_PARTNER_API_KEY environment variables.
 */
export async function searchOzonPartner(query: string, limit = 8): Promise<SearchResult[]> {
  if (!hasCredentials()) return [];
  const clientId = getEnv("OZON_PARTNER_CLIENT_ID");
  const apiKey = getEnv("OZON_PARTNER_API_KEY");

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(OZON_SEARCH_URL, {
      method: "POST",
      headers: {
        "Client-Id": clientId,
        "Api-Key": apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ text: query, limit: Math.min(limit, 100), offset: 0 }),
      signal: controller.signal,
    });
    if (!response.ok) return [];
    const payload = (await response.json()) as {
      result?: { items?: Array<Record<string, unknown>> };
    };
    const items = payload.result?.items ?? [];

    return items
      .map((item): SearchResult => {
        const id = String(item.id ?? "");
        const priceObj = (item.price ?? {}) as { price?: number; old_price?: number };
        const price = toRubles(priceObj.price);
        const oldPrice = toRubles(priceObj.old_price);
        return {
          id: `ozon-${id}`,
          title: String(item.name ?? item.title ?? "Товар"),
          price,
          oldPrice: oldPrice && oldPrice > price ? oldPrice : null,
          rating: item.rating != null ? Number(item.rating) : null,
          url: `https://www.ozon.ru/product/${id}/`,
          source: "Ozon",
          verified: true,
          verificationStatus: "api",
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
