export interface FixtureProduct {
  title: string;
  brand?: string;
  price: number;
  oldPrice?: number;
  currency: string;
  available?: boolean;
  url?: string;
}

const numberValue = (value: unknown): number | undefined => {
  const n = Number(String(value ?? "").replace(/\s/g, "").replace(",", "."));
  return Number.isFinite(n) && n > 0 ? n : undefined;
};

export function parseProductJsonLd(html: string): FixtureProduct[] {
  const scripts = [...html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)];
  const products: FixtureProduct[] = [];
  for (const match of scripts) {
    try {
      const data = JSON.parse(match[1].trim());
      const candidates = Array.isArray(data) ? data : data?.["@graph"] ?? [data];
      for (const item of candidates) {
        if (item?.["@type"] !== "Product" || !item.name) continue;
        const offers = Array.isArray(item.offers) ? item.offers : [item.offers];
        const offer = offers.find((entry) => numberValue(entry?.price) !== undefined) ?? offers[0];
        const price = numberValue(offer?.price);
        if (price === undefined) continue;
        const oldPrice = numberValue(offer?.priceSpecification?.price) ?? numberValue(offer?.highPrice);
        const availabilityRaw = String(offer?.availability ?? "");
        const available = availabilityRaw ? !/(OutOfStock|SoldOut|Unavailable|нет\s+в\s+наличии)/i.test(availabilityRaw) : undefined;
        products.push({
          title: String(item.name).trim(),
          brand: typeof item.brand === "string" ? item.brand : item.brand?.name,
          price,
          oldPrice: oldPrice !== undefined && oldPrice > price ? oldPrice : undefined,
          currency: String(offer?.priceCurrency ?? "RUB"),
          available,
          url: offer?.url ?? item.url,
        });
      }
    } catch {
      // Ignore malformed JSON-LD blocks and continue with other blocks.
    }
  }
  return products;
}
