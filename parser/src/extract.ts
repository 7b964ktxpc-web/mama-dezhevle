import type { ParsedProduct, Marketplace } from "./types";

const SCRIPT_RE = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;

function clean(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const text = value.replace(/\\u002F/g, "/").replace(/\\"/g, '"').trim();
  return text || undefined;
}

function number(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "string") return undefined;
  const normalized = value.replace(/\s/g, "").replace(/,/g, ".").replace(/[^0-9.\-]/g, "");
  const parsed = Number(normalized);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

function image(value: unknown): string | undefined {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return image(value[0]);
  if (value && typeof value === "object" && "url" in value) return image((value as { url?: unknown }).url);
  return undefined;
}

function parseJson(text: string): unknown {
  try { return JSON.parse(text); } catch {
    try { return JSON.parse(text.replace(/&quot;/g, '"').replace(/&#39;/g, "'")); } catch { return undefined; }
  }
}

function flatten(value: unknown): unknown[] {
  if (Array.isArray(value)) return value.flatMap(flatten);
  if (value && typeof value === "object" && Array.isArray((value as { "@graph"?: unknown[] })["@graph"])) {
    return flatten((value as { "@graph": unknown[] })["@graph"]);
  }
  return value == null ? [] : [value];
}

export function extractJsonLd(html: string): unknown[] {
  const values: unknown[] = [];
  for (const match of html.matchAll(SCRIPT_RE)) {
    const parsed = parseJson(match[1]);
    values.push(...flatten(parsed));
  }
  return values;
}

export function extractProductsFromJsonLd(html: string, marketplace: Marketplace, sourceUrl: string): ParsedProduct[] {
  const products: ParsedProduct[] = [];
  for (const raw of extractJsonLd(html)) {
    if (!raw || typeof raw !== "object") continue;
    const item = raw as Record<string, unknown>;
    const type = String(item["@type"] ?? "").toLowerCase();
    if (!type.includes("product") && !item.name) continue;

    const offers = Array.isArray(item.offers) ? item.offers[0] : item.offers;
    const offer = offers && typeof offers === "object" ? offers as Record<string, unknown> : {};
    const price = number(offer.price ?? offer.lowPrice ?? item.price);
    const url = clean(item.url) ?? sourceUrl;
    const title = clean(item.name);
    if (!title || !price) continue;

    const brandValue = item.brand;
    const brand = typeof brandValue === "string" ? brandValue : brandValue && typeof brandValue === "object"
      ? clean((brandValue as Record<string, unknown>).name) : undefined;
    const aggregate = item.aggregateRating && typeof item.aggregateRating === "object"
      ? item.aggregateRating as Record<string, unknown> : {};

    products.push({
      marketplace,
      externalId: clean(item.sku ?? item.productID ?? item.mpn ?? url) ?? url,
      title,
      url,
      price,
      oldPrice: number(offer.highPrice),
      currency: clean(offer.priceCurrency) ?? "RUB",
      brand,
      imageUrl: image(item.image),
      rating: number(aggregate.ratingValue),
      reviewsCount: number(aggregate.reviewCount),
      available: offer.availability ? !String(offer.availability).toLowerCase().includes("outofstock") : undefined,
      sourceUrl,
      collectedAt: new Date().toISOString(),
    });
  }
  return dedupe(products);
}

export function dedupe(products: ParsedProduct[]): ParsedProduct[] {
  const byKey = new Map<string, ParsedProduct>();
  for (const product of products) {
    const key = `${product.marketplace}:${product.externalId}:${product.url}`;
    if (!byKey.has(key)) byKey.set(key, product);
  }
  return [...byKey.values()];
}
