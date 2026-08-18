export interface FixtureProduct {
  title: string;
  brand?: string;
  price: number;
  currency: string;
  url?: string;
}

export function parseProductJsonLd(html: string): FixtureProduct[] {
  const scripts = [...html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)];
  const products: FixtureProduct[] = [];
  for (const match of scripts) {
    try {
      const data = JSON.parse(match[1].trim());
      const candidates = Array.isArray(data) ? data : data?.['@graph'] ?? [data];
      for (const item of candidates) {
        if (item?.['@type'] !== 'Product' || !item.name) continue;
        const offer = Array.isArray(item.offers) ? item.offers[0] : item.offers;
        const price = Number(String(offer?.price ?? '').replace(/\s/g, '').replace(',', '.'));
        if (!Number.isFinite(price) || price <= 0) continue;
        products.push({ title: String(item.name).trim(), brand: typeof item.brand === 'string' ? item.brand : item.brand?.name, price, currency: String(offer?.priceCurrency ?? 'RUB'), url: offer?.url ?? item.url });
      }
    } catch {
      // Ignore malformed JSON-LD blocks and continue with other blocks.
    }
  }
  return products;
}
