import type { Marketplace, ParsedProduct } from "./types";

type JsonLdRecord = Record<string, unknown>;

const asRecord = (value: unknown): JsonLdRecord | undefined => value && typeof value === "object" && !Array.isArray(value) ? value as JsonLdRecord : undefined;

export function extractJsonLdProducts(html: string, marketplace: Marketplace, sourceUrl: string): ParsedProduct[] {
  const products: ParsedProduct[] = [];
  const scripts = [...html.matchAll(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)];
  for (const match of scripts) {
    try {
      const parsed: unknown = JSON.parse(match[1].trim());
      const record = asRecord(parsed);
      const graph = record?.["@graph"];
      const nodes: unknown[] = Array.isArray(parsed) ? parsed : Array.isArray(graph) ? graph : [parsed];
      for (const rawNode of nodes) {
        const node = asRecord(rawNode);
        if (node?.["@type"] !== "Product" || typeof node.name !== "string") continue;
        const rawOffers = node.offers;
        const offers: unknown[] = Array.isArray(rawOffers) ? rawOffers : [rawOffers];
        const offer = asRecord(offers[0]);
        const price = Number(offer?.price);
        if (!Number.isFinite(price)) continue;
        const brandRecord = asRecord(node.brand);
        products.push({ marketplace, externalId: String(node.sku ?? node.mpn ?? node.gtin ?? node.name), title: node.name, brand: typeof node.brand === "string" ? node.brand : typeof brandRecord?.name === "string" ? brandRecord.name : undefined, url: sourceUrl, price, currency: String(offer?.priceCurrency ?? "RUB"), sourceUrl, collectedAt: new Date().toISOString() });
      }
    } catch {
      // Ignore malformed JSON-LD blocks; other extraction strategies may still succeed.
    }
  }
  return products;
}
