import type { Product } from "../types";
import type { ProductSource } from "./source";

type AffiliateResponse = {
  status?: string;
  link?: {
    url?: string;
    shortUrl?: string;
    productPhoto?: string;
    title?: string;
  };
  promise?: number | null;
  price?: number | null;
  stockAmount?: number | null;
};

const API_BASE = "https://api.content.market.yandex.ru/v3/affiliate";

function env(name: string): string | undefined {
  const value = process.env[name]?.trim();
  return value || undefined;
}

function configuredUrls(): string[] {
  return (env("YANDEX_AFFILIATE_PRODUCT_URLS") ?? "")
    .split(/[\n,]/)
    .map((value) => value.trim())
    .filter(Boolean);
}

async function getAffiliateProduct(url: string): Promise<Product> {
  const token = env("YANDEX_AFFILIATE_API_KEY");
  const placeId = env("YANDEX_AFFILIATE_PLACE_ID");
  if (!token || !placeId) throw new Error("Yandex Market Affiliate API is not configured");

  const params = new URLSearchParams({ url, place_id: placeId, format: "json" });
  const response = await fetch(`${API_BASE}/partner/link/create?${params.toString()}`, {
    headers: { Authorization: `OAuth ${token}` },
  });

  const body = (await response.json()) as AffiliateResponse | { message?: string };
  if (!response.ok) {
    throw new Error(`Yandex Market Affiliate API ${response.status}: ${JSON.stringify(body)}`);
  }

  const data = body as AffiliateResponse;
  const title = data.link?.title?.trim();
  const price = Number(data.price);
  if (!title || !Number.isFinite(price)) {
    throw new Error(`Yandex Market Affiliate API returned incomplete product data for ${url}`);
  }

  return {
    externalId: url,
    source: "yandex-market",
    url: data.link?.url || data.link?.shortUrl || url,
    title,
    imageUrl: data.link?.productPhoto ?? null,
    price,
    oldPrice: null,
    available: Number(data.stockAmount ?? 0) > 0,
  };
}

export const yandexMarketAffiliateSource: ProductSource = {
  id: "yandex-market-affiliate",
  name: "Яндекс Маркет (Affiliate API)",
  isEnabled: () => Boolean(env("YANDEX_AFFILIATE_API_KEY") && env("YANDEX_AFFILIATE_PLACE_ID") && configuredUrls().length),
  collect: async () => {
    const products: Product[] = [];
    for (const url of configuredUrls()) products.push(await getAffiliateProduct(url));
    return products;
  },
};
