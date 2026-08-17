import type { Product } from "../types";

const DEFAULT_URL = "https://www.detmir.ru/page/sale-sale/";

type DetmirListing = {
  externalId: string;
  title: string;
  url: string;
  price: number;
  oldPrice?: number | null;
  rating?: number | null;
  imageUrl?: string | null;
  category?: string | null;
  available?: boolean;
};

export function detmirSourceUrl() {
  return process.env.DETMIR_SOURCE_URL || DEFAULT_URL;
}

function asNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "string") return null;
  const normalized = value.replace(/[\s\u00a0\u202f₽]/g, "").replace(",", ".");
  const parsed = Number(normalized.replace(/[^0-9.]/g, ""));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function stripTags(value: string): string {
  return value
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&amp;/gi, "&")
    .replace(/\s+/g, " ")
    .trim();
}

function collectJsonLd(html: string): DetmirListing[] {
  const listings: DetmirListing[] = [];
  const blocks = html.match(/<script[^>]*type=["']application\/ld\+json["'][^>]*>[\s\S]*?<\/script>/gi) ?? [];

  for (const block of blocks) {
    const json = block.replace(/^<script[^>]*>/i, "").replace(/<\/script>$/i, "").trim();
    try {
      const parsed = JSON.parse(json) as unknown;
      const nodes = Array.isArray(parsed)
        ? parsed
        : typeof parsed === "object" && parsed !== null && "@graph" in parsed
          ? ((parsed as { "@graph"?: unknown[] })["@graph"] ?? [])
          : [parsed];

      for (const node of nodes) {
        if (!node || typeof node !== "object") continue;
        const item = node as Record<string, unknown>;
        const type = item["@type"];
        if (type !== "Product" && !(Array.isArray(type) && type.includes("Product"))) continue;
        const offers = item.offers as Record<string, unknown> | undefined;
        const price = asNumber(offers?.price);
        const url = typeof item.url === "string" ? item.url : null;
        const title = typeof item.name === "string" ? item.name.trim() : "";
        if (!price || !url || !title) continue;
        const sku = typeof item.sku === "string" ? item.sku : undefined;
        const image = Array.isArray(item.image) ? item.image[0] : item.image;
        const imageUrl = typeof image === "string" ? image : null;
        const ratingValue = asNumber((item.aggregateRating as Record<string, unknown> | undefined)?.ratingValue);
        listings.push({ externalId: `detmir:${sku ?? url}`, title, url: url.startsWith("http") ? url : new URL(url, detmirSourceUrl()).toString(), price, oldPrice: null, rating: ratingValue, imageUrl, category: "Детские товары", available: true });
      }
    } catch {
      // Ignore malformed JSON-LD blocks and continue with other public blocks.
    }
  }
  return listings;
}

function collectListingHtml(html: string): DetmirListing[] {
  const listings: DetmirListing[] = [];
  const pattern = /(?:−|-)\s*(\d+)\s*%[\s\S]{0,700}?([0-9][0-9\s\u00a0\u202f.,]*\s*₽)[\s\S]{0,80}?([0-9][0-9\s\u00a0\u202f.,]*\s*₽)[\s\S]{0,1200}?href=["']((?:https?:\/\/www\.detmir\.ru)?\/product\/index\/id\/\d+\/)["'][^>]*>([\s\S]{1,500}?)<\/a>/gi;

  for (const match of html.matchAll(pattern)) {
    const discount = Number(match[1]);
    const price = asNumber(match[2]);
    const oldPrice = asNumber(match[3]);
    const href = match[4];
    const title = stripTags(match[5]);
    if (!price || !oldPrice || !href || !title || !Number.isFinite(discount)) continue;
    const url = href.startsWith("http") ? href : new URL(href, detmirSourceUrl()).toString();
    listings.push({
      externalId: `detmir:${url}`,
      title,
      url,
      price,
      oldPrice: oldPrice > price ? oldPrice : null,
      rating: null,
      imageUrl: null,
      category: "Детские товары",
      available: true,
    });
  }

  const unique = new Map<string, DetmirListing>();
  for (const item of listings) unique.set(item.externalId, item);
  return [...unique.values()];
}

export function normalizeDetmirListings(listings: DetmirListing[]): Product[] {
  return listings
    .filter((item) => item.title && item.url && Number.isFinite(item.price) && item.price > 0)
    .map((item) => ({
      externalId: item.externalId,
      source: "detmir",
      url: item.url,
      title: item.title.trim(),
      category: item.category ?? "Детские товары",
      imageUrl: item.imageUrl ?? null,
      rating: item.rating ?? null,
      reviewsCount: null,
      price: item.price,
      oldPrice: item.oldPrice ?? null,
      available: item.available ?? true,
    }));
}

export async function collectDetmirPublic(): Promise<Product[]> {
  const response = await fetch(detmirSourceUrl(), {
    headers: {
      accept: "text/html,application/xhtml+xml",
      "user-agent": "Mozilla/5.0 (compatible; mama-dezhevle/1.0; public-catalog-reader)",
    },
  });
  if (!response.ok) throw new Error(`Detmir public catalog ${response.status}: ${await response.text()}`);

  const html = await response.text();
  const jsonLdProducts = collectJsonLd(html);
  const products = normalizeDetmirListings(jsonLdProducts.length ? jsonLdProducts : collectListingHtml(html));
  if (products.length === 0) throw new Error("Detmir public catalog returned no product entries");
  return products;
}
