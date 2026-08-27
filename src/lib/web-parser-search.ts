import type { SearchResult } from "./product-search";
import { searchMarketplaces } from "./marketplace-search";
import { searchProductsWithAi } from "./ai-search";
import { searchOzonPartner } from "./ozon-partner";

export type WebParserSearchResult = SearchResult & {
  source?: string;
  verified?: boolean;
  verificationStatus?: string;
};

function parserUrl() {
  return process.env.PARSER_API_URL?.replace(/\/$/, "");
}

export async function searchWebParser(query: string, limit = 5): Promise<WebParserSearchResult[]> {
  const base = parserUrl();
  if (!base) return [];

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), Number(process.env.PARSER_API_TIMEOUT_MS || 12000));
  try {
    const url = `${base}/api/child-search?q=${encodeURIComponent(query)}&limit=${Math.min(Math.max(limit, 1), 20)}`;
    const response = await fetch(url, { signal: controller.signal, headers: { accept: "application/json" }, cache: "no-store" });
    if (!response.ok) return [];
    const payload = await response.json() as { confirmed?: Array<Record<string, unknown>> };
    return (payload.confirmed ?? []).map((item) => {
      const price = Number(item.price);
      return {
        id: String(item.id ?? item.url ?? `web-${Math.random().toString(36).slice(2)}`),
        title: String(item.title ?? item.representative_title ?? "Товар"),
        price,
        oldPrice: item.old_price == null ? null : Number(item.old_price),
        rating: item.rating == null ? null : Number(item.rating),
        url: String(item.url ?? ""),
        imageUrl: item.image_url == null ? null : String(item.image_url),
        source: item.source == null ? undefined : String(item.source),
        verified: item.verified === true,
        verificationStatus: item.verification_status == null ? undefined : String(item.verification_status),
      };
    }).filter((item) => item.url && Number.isFinite(item.price));
  } catch {
    return [];
  } finally {
    clearTimeout(timer);
  }
}

// Public name for the Telegram/conversation layer. Order of fallback:
// 1) external parser microservice (if PARSER_API_URL configured),
// 2) Ozon Partner API (if OZON_PARTNER_CLIENT_ID/KEY set) — free, real prices,
// 3) AI web search (if a Gemini/AI key is set) — the "ИИ ищет" path,
// 4) direct marketplace scraping (anti-bot may block it in some environments).
export async function searchWebProducts(query: string, limit = 5): Promise<SearchResult[]> {
  const base = parserUrl();
  if (base) return searchWebParser(query, limit);
  const ozon = await searchOzonPartner(query, limit);
  if (ozon.length) return ozon;
  const ai = await searchProductsWithAi(query, limit);
  if (ai.length) return ai;
  return searchMarketplaces(query, limit);
}
