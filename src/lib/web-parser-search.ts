import type { SearchResult } from "./product-search";
import { searchMarketplaces } from "./marketplace-search";
import { searchProductsWithAi, searchOpenAiWeb } from "./ai-search";
import { searchOzonPartner } from "./ozon-partner";
import { searchDuckDuckGo } from "./web-search-free";
import { searchYandexMarket } from "./yandex-market-search";
import { searchOzonDirect } from "./sources/ozon-search";
import { searchWildberriesDirect } from "./sources/wildberries-search";

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
// 2) Yandex Market Partner API (YANDEX_MARKET_API_KEY/BUSINESS_ID) — real search,
// 3) Ozon Partner API (if OZON_PARTNER_CLIENT_ID/KEY set) — free, real prices,
// 4) AI web search — Gemini (GEMINI_API_KEY) or OpenAI (OPENAI_API_KEY) — "ИИ ищет",
// 5) direct marketplace scraping (anti-bot may block it in some environments),
// 6) keyless DuckDuckGo links (last resort; may be empty).
export async function searchWebProducts(query: string, limit = 5): Promise<SearchResult[]> {
  const base = parserUrl();
  if (base) return searchWebParser(query, limit);
  const yamarket = await searchYandexMarket(query, limit);
  if (yamarket.length) return yamarket;
  const ozonDirect = await searchOzonDirect(query, limit);
  if (ozonDirect.length) return ozonDirect;
  const wbDirect = await searchWildberriesDirect(query, limit);
  if (wbDirect.length) return wbDirect;
  const ozon = await searchOzonPartner(query, limit);
  if (ozon.length) return ozon;
  const gemini = await searchProductsWithAi(query, limit);
  if (gemini.length) return gemini;
  const openai = await searchOpenAiWeb(query, limit);
  if (openai.length) return openai;
  const market = await searchMarketplaces(query, limit);
  if (market.length) return market;
  return searchDuckDuckGo(query, limit);
}
