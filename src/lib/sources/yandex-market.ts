import type { Product } from "../types";
import type { ProductSource } from "./source";

const API_BASE = "https://api.partner.market.yandex.ru";
const SOURCE = "yandex-market";

type JsonRecord = Record<string, any>;

function requiredEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing environment variable: ${name}`);
  return value;
}

async function api<T>(path: string, body?: JsonRecord): Promise<T> {
  const token = requiredEnv("YANDEX_MARKET_API_KEY");
  const response = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers: {
      accept: "application/json",
      "content-type": "application/json",
      "Api-Key": token,
    },
    body: JSON.stringify(body ?? {}),
  });

  const payload = (await response.json()) as JsonRecord;
  if (!response.ok) {
    throw new Error(`Yandex Market API ${response.status}: ${JSON.stringify(payload)}`);
  }
  if (payload.status && payload.status !== "OK") {
    throw new Error(`Yandex Market API error: ${JSON.stringify(payload)}`);
  }
  return payload as T;
}

async function getMappings(businessId: string) {
  const items: JsonRecord[] = [];
  let pageToken: string | undefined;

  do {
    const query = new URLSearchParams({ language: "RU", limit: "100" });
    if (pageToken) query.set("pageToken", pageToken);
    const result = await api<JsonRecord>(`/v2/businesses/${businessId}/offer-mappings?${query}`, {});
    items.push(...(result.result?.offerMappings ?? []));
    pageToken = result.result?.paging?.nextPageToken || undefined;
  } while (pageToken);

  return items;
}

async function getPrices(businessId: string) {
  const prices = new Map<string, JsonRecord>();
  let pageToken: string | undefined;

  do {
    const query = new URLSearchParams({ limit: "500" });
    if (pageToken) query.set("pageToken", pageToken);
    const result = await api<JsonRecord>(`/v2/businesses/${businessId}/offer-prices?${query}`, {});
    for (const item of result.result?.offerPrices ?? []) {
      const offerId = item.offerId ?? item.offer?.offerId;
      if (offerId) prices.set(String(offerId), item);
    }
    pageToken = result.result?.paging?.nextPageToken || undefined;
  } while (pageToken);

  return prices;
}

function toNumber(value: unknown): number | null {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : null;
}

function normalizeMapping(mapping: JsonRecord, priceRow?: JsonRecord): Product | null {
  const offer = mapping.offer ?? {};
  const offerId = String(offer.offerId ?? "").trim();
  const title = String(offer.name ?? "").trim();
  const showcase = (mapping.showcaseUrls ?? []).find((item: JsonRecord) => item?.showcaseType === "B2C")
    ?? (mapping.showcaseUrls ?? [])[0];
  const url = String(showcase?.showcaseUrl ?? "").trim();
  const price = toNumber(priceRow?.price?.value ?? priceRow?.price ?? offer.basicPrice?.value);

  if (!offerId || !title || !url || price === null) return null;

  const oldPrice = toNumber(priceRow?.price?.discountBase ?? priceRow?.discountBase);
  const picture = Array.isArray(offer.pictures) ? offer.pictures[0] : null;
  const marketCategory = offer.marketCategoryName ?? offer.category ?? null;

  return {
    externalId: offerId,
    source: SOURCE,
    url,
    title,
    brand: offer.vendor ?? null,
    category: marketCategory,
    ageLabel: offer.age?.value ?? null,
    imageUrl: typeof picture === "string" ? picture : null,
    rating: null,
    reviewsCount: null,
    price,
    oldPrice: oldPrice !== null && oldPrice > price ? oldPrice : null,
    available: true,
  };
}

export async function collectYandexMarket(): Promise<Product[]> {
  const businessId = requiredEnv("YANDEX_MARKET_BUSINESS_ID");
  const mappings = await getMappings(businessId);
  const prices = await getPrices(businessId);

  return mappings
    .map((mapping) => normalizeMapping(mapping, prices.get(String(mapping.offer?.offerId ?? ""))))
    .filter((product): product is Product => product !== null);
}

export const yandexMarketSource: ProductSource = {
  id: SOURCE,
  name: "Яндекс Маркет API",
  isEnabled: () => Boolean(process.env.YANDEX_MARKET_API_KEY && process.env.YANDEX_MARKET_BUSINESS_ID),
  collect: collectYandexMarket,
};
