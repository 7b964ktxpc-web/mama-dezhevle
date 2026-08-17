import type { Product } from "../types";

/**
 * Optional Ozon public-page collector.
 *
 * It is intentionally disabled unless OZON_SEARCH_URL is configured.
 * We only consume the public HTML returned by the marketplace and do not
 * bypass authentication, CAPTCHAs, robots, or other access controls.
 */
export async function getOzonPublicProducts(): Promise<Product[]> {
  const url = process.env.OZON_SEARCH_URL;
  if (!url) return [];
  if (!url.startsWith("https://www.ozon.ru/")) {
    throw new Error("OZON_SEARCH_URL must be an Ozon public URL");
  }

  const response = await fetch(url, {
    headers: {
      "user-agent": "Mozilla/5.0 (compatible; MamaDezhevle/0.1)",
      accept: "text/html,application/xhtml+xml",
    },
    cache: "no-store",
  });

  if (!response.ok) throw new Error(`Ozon returned HTTP ${response.status}`);

  const html = await response.text();
  return parseOzonJsonLd(html);
}

function parseOzonJsonLd(html: string): Product[] {
  const products: Product[] = [];
  const blocks = html.match(/<script[^>]+type=["']application\/ld\+json["'][^>]*>[\s\S]*?<\/script>/gi) ?? [];

  for (const block of blocks) {
    const raw = block.replace(/^.*?>/, "").replace(/<\/script>\s*$/i, "");
    try {
      const parsed = JSON.parse(raw);
      const items = Array.isArray(parsed) ? parsed : [parsed];
      for (const item of items) {
        const candidates = item?.itemListElement ?? [];
        for (const entry of candidates) {
          const product = entry?.item ?? entry;
          const price = Number(product?.offers?.price ?? product?.offers?.lowPrice);
          if (!product?.name || !product?.url || !Number.isFinite(price) || price <= 0) continue;
          products.push({
            externalId: String(product.sku ?? product.productID ?? product.url),
            source: "ozon-public",
            url: String(product.url),
            title: String(product.name).trim(),
            brand: product.brand?.name ? String(product.brand.name) : undefined,
            price,
            oldPrice: undefined,
            rating: product.aggregateRating?.ratingValue ? Number(product.aggregateRating.ratingValue) : undefined,
            reviewsCount: product.aggregateRating?.reviewCount ? Number(product.aggregateRating.reviewCount) : undefined,
            available: true,
          });
        }
      }
    } catch {
      // Ignore malformed/non-product JSON-LD blocks.
    }
  }

  return dedupe(products);
}

function dedupe(products: Product[]) {
  return [...new Map(products.map((product) => [product.externalId, product])).values()];
}
