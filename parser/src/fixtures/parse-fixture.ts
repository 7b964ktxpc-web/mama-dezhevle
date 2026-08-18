export interface FixtureProduct {
  title: string;
  brand?: string;
  price: number;
  oldPrice?: number;
  currency: string;
  available?: boolean;
  url?: string;
}

type JsonLdRecord = Record<string, unknown>;

const numberValue = (value: unknown): number | undefined => {
  const n = Number(String(value ?? "").replace(/\s/g, "").replace(",", "."));
  return Number.isFinite(n) && n > 0 ? n : undefined;
};

const asRecord = (value: unknown): JsonLdRecord | undefined => value && typeof value === "object" && !Array.isArray(value) ? value as JsonLdRecord : undefined;

export function parseProductJsonLd(html: string): FixtureProduct[] {
  const scripts = [...html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)];
  const products: FixtureProduct[] = [];
  for (const match of scripts) {
    try {
      const data: unknown = JSON.parse(match[1].trim());
      const record = asRecord(data);
      const graph = record?.["@graph"];
      const candidates: unknown[] = Array.isArray(data) ? data : Array.isArray(graph) ? graph : [data];
      for (const rawItem of candidates) {
        const item = asRecord(rawItem);
        if (item?.["@type"] !== "Product" || typeof item.name !== "string") continue;
        const rawOffers = item.offers;
        const offers: unknown[] = Array.isArray(rawOffers) ? rawOffers : [rawOffers];
        const offer = offers.map(asRecord).find((entry) => numberValue(entry?.price) !== undefined) ?? asRecord(offers[0]);
        const price = numberValue(offer?.price);
        if (price === undefined) continue;
        const priceSpecification = asRecord(offer?.priceSpecification);
        const oldPrice = numberValue(priceSpecification?.price) ?? numberValue(offer?.highPrice);
        const availabilityRaw = String(offer?.availability ?? "");
        const available = availabilityRaw ? !/(OutOfStock|SoldOut|Unavailable|нет\s+в\s+наличии)/i.test(availabilityRaw) : undefined;
        const brandRecord = asRecord(item.brand);
        products.push({
          title: item.name.trim(),
          brand: typeof item.brand === "string" ? item.brand : typeof brandRecord?.name === "string" ? brandRecord.name : undefined,
          price,
          oldPrice: oldPrice !== undefined && oldPrice > price ? oldPrice : undefined,
          currency: String(offer?.priceCurrency ?? "RUB"),
          available,
          url: typeof offer?.url === "string" ? offer.url : typeof item.url === "string" ? item.url : undefined,
        });
      }
    } catch {
      // Ignore malformed JSON-LD blocks and continue with other blocks.
    }
  }
  return products;
}
