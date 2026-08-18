import type { ParsedProduct } from "./types";

export function extractJsonLdProducts(html: string, marketplace: string, sourceUrl: string): ParsedProduct[] {
  const products: ParsedProduct[] = [];
  const scripts = [...html.matchAll(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)];
  for (const match of scripts) {
    try {
      const parsed = JSON.parse(match[1].trim());
      const nodes = Array.isArray(parsed) ? parsed : parsed?.['@graph'] ?? [parsed];
      for (const node of nodes) {
        if (!node || node['@type'] !== 'Product' || typeof node.name !== 'string') continue;
        const offer = Array.isArray(node.offers) ? node.offers[0] : node.offers;
        const price = Number(offer?.price);
        if (!Number.isFinite(price)) continue;
        products.push({ marketplace, externalId: String(node.sku ?? node.mpn ?? node.gtin ?? node.name), title: node.name, brand: typeof node.brand === 'string' ? node.brand : node.brand?.name, url: sourceUrl, price, currency: String(offer?.priceCurrency ?? 'RUB'), sourceUrl, collectedAt: new Date().toISOString() });
      }
    } catch {
      // Ignore malformed JSON-LD blocks; other extraction strategies may still succeed.
    }
  }
  return products;
}
