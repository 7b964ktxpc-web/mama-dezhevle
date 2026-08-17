import type { Product } from "../types";

const DEFAULT_URL = "https://www.detmir.ru/page/sale-sale/";
const MAX_REVIEWS_COUNT = 1_000_000;

type DetmirListing = {
  externalId: string;
  title: string;
  url: string;
  price: number;
  oldPrice?: number | null;
  rating?: number | null;
  reviewsCount?: number | null;
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

function safeReviewsCount(value: number | null): number | null {
  if (value == null || !Number.isFinite(value)) return null;
  const rounded = Math.round(value);
  return rounded > 0 && rounded <= MAX_REVIEWS_COUNT ? rounded : null;
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

function extractReviews(text: string): { rating: number | null; reviewsCount: number | null } {
  const ratingMatch = text.match(/Рейтинг:\s*(\d(?:[.,]\d)?)/i);
  const rating = ratingMatch ? asNumber(ratingMatch[1]) : null;

  // Keep this deliberately strict. The previous expression consumed arbitrary
  // digit sequences from the surrounding card/context and could produce huge
  // values such as 9.12e+51, which PostgreSQL cannot store in integer.
  const reviewMatch = text.match(/Рейтинг:\s*\d(?:[.,]\d)?\s+(\d{1,7})(?=\s|$)/i);
  const reviewsCount = reviewMatch ? safeReviewsCount(asNumber(reviewMatch[1])) : null;

  return {
    rating: rating != null && rating <= 5 ? rating : null,
    reviewsCount,
  };
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
        const reviewsCount = safeReviewsCount(asNumber((item.aggregateRating as Record<string, unknown> | undefined)?.reviewCount));
        listings.push({ externalId: `detmir:${sku ?? url}`, title, url: url.startsWith("http") ? url : new URL(url, detmirSourceUrl()).toString(), price, oldPrice: null, rating: ratingValue, reviewsCount, imageUrl, category: "Детские товары", available: true });
      }
    } catch {
      // Ignore malformed JSON-LD blocks and continue with other public blocks.
    }
  }
  return listings;
}

function extractPrices(text: string): number[] {
  const matches = text.match(/\d[\d\s\u00a0\u202f.,]*\s*₽/g) ?? [];
  const values: number[] = [];
  for (const match of matches) {
    const value = asNumber(match);
    if (value && !values.includes(value)) values.push(value);
  }
  return values;
}

function collectListingHtml(html: string): DetmirListing[] {
  const listings: DetmirListing[] = [];
  const productHref = /href\s*=\s*["']([^"']*\/product\/[^"']+)["']/gi;

  for (const match of html.matchAll(productHref)) {
    const href = match[1];
    const position = match.index ?? 0;
    const anchorStart = html.lastIndexOf("<a", position);
    const anchorEnd = html.indexOf("</a>", position);
    const anchorText = anchorStart >= 0 && anchorEnd > position
      ? stripTags(html.slice(anchorStart, anchorEnd + 4))
      : "";
    const before = stripTags(html.slice(Math.max(0, position - 2600), position));
    const after = stripTags(html.slice(position, Math.min(html.length, position + 1600)));
    const context = `${anchorText} ${before} ${after}`;

    const discountMatches = [...before.matchAll(/(?:−|-)\s*(\d{1,3})\s*%/g)];
    const discount = discountMatches.length ? Number(discountMatches.at(-1)?.[1]) : null;
    const prices = extractPrices(before).slice(-4);
    const title = anchorText
      .replace(/^(В избранное|В корзину)\s*/i, "")
      .replace(/\s+(В избранное|В корзину).*$/i, "")
      .replace(/\s+/g, " ")
      .trim();
    const reviewMeta = extractReviews(context);

    if (!href || !title || title.length < 8 || !prices.length || !discount || !Number.isFinite(discount)) continue;

    const currentPrice = prices.at(-2) ?? prices.at(-1) ?? null;
    const oldPrice = prices.at(-1) ?? null;
    if (!currentPrice || !oldPrice || oldPrice <= currentPrice) continue;

    const url = href.startsWith("http") ? href : new URL(href, detmirSourceUrl()).toString();
    listings.push({
      externalId: `detmir:${url}`,
      title,
      url,
      price: currentPrice,
      oldPrice,
      rating: reviewMeta.rating,
      reviewsCount: reviewMeta.reviewsCount,
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
      reviewsCount: safeReviewsCount(item.reviewsCount ?? null),
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
