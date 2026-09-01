import type { SearchResult } from "./product-search";

const API_BASE = "https://api.partner.market.yandex.ru/v2";
const REQUEST_TIMEOUT_MS = 18_000;

function getEnv(name: string) {
  return process.env[name]?.trim() || "";
}

function hasCredentials() {
  return Boolean(getEnv("YANDEX_MARKET_API_KEY") && getEnv("YANDEX_MARKET_BUSINESS_ID"));
}

// Yandex Partner API returns prices in the minor currency unit (kopecks). Odd,
// non-round rouble values are kept as-is; integer multiples of 100 are treated
// as kopecks and divided. (If prices look 100x off in the first run, flip this.)
function toRubles(value: unknown) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return 0;
  const isKopecks = n > 100 && n % 100 === 0;
  return Math.round(isKopecks ? n / 100 : n);
}

function pickName(item: Record<string, unknown>) {
  return String(item.offerName ?? item.modelName ?? item.name ?? item.title ?? "Товар");
}

/**
 * Search Yandex Market via the official Partner API (text search). Uses the
 * YANDEX_MARKET_API_KEY (OAuth token) and YANDEX_MARKET_BUSINESS_ID secrets that
 * are already configured in the repo. Returns real offers with prices.
 */
export async function searchYandexMarket(query: string, limit = 10): Promise<SearchResult[]> {
  if (!hasCredentials()) return [];
  const token = getEnv("YANDEX_MARKET_API_KEY");
  const businessId = getEnv("YANDEX_MARKET_BUSINESS_ID");

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(
      `${API_BASE}/search?text=${encodeURIComponent(query)}&count=${Math.min(limit, 30)}`,
      {
        method: "GET",
        headers: {
          Authorization: `OAuth ${token}`,
          "X-Business-Id": businessId,
          Accept: "application/json",
        },
        signal: controller.signal,
      }
    );
    if (!response.ok) {
      console.error("Yandex Market search failed:", response.status, await response.text().catch(() => ""));
      return [];
    }
    const payload = (await response.json()) as {
      result?: { items?: Array<Record<string, unknown>> } | Array<Record<string, unknown>>;
      status?: string;
    };
    const raw = Array.isArray(payload.result)
      ? payload.result
      : (payload.result as { items?: Array<Record<string, unknown>> } | undefined)?.items ?? [];

    return raw
      .map((item): SearchResult => {
        const priceObj = (item.price ?? {}) as { value?: number; currencyId?: string };
        const price = toRubles(priceObj.value);
        const url = String(item.url ?? "");
        const shop = String(item.shopName ?? item.businessName ?? item.shop ?? "").trim();
        return {
          id: `yamarket-${String(item.offerId ?? Math.random().toString(36).slice(2, 8))}`,
          title: pickName(item),
          price,
          oldPrice: null,
          rating: item.rating != null ? Number(item.rating) : null,
          url,
          source: shop || "Яндекс Маркет",
          verified: Boolean(url),
          verificationStatus: "api",
        };
      })
      .filter((r) => r.price > 0 && r.url)
      .slice(0, limit);
  } catch (error) {
    console.error("Yandex Market search error:", error);
    return [];
  } finally {
    clearTimeout(timer);
  }
}
