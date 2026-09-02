import { gatewaySearch, type SearchEvent } from "./kettu-gateway";
import type { SearchResult } from "./product-search";

const SOURCE_LABELS: Record<string, string> = {
  wildberries: "Wildberries",
  yandex_market: "Яндекс Маркет",
  megamarket: "Мегамаркет",
  ozon: "Ozon",
  lamoda: "Lamoda",
  dns: "DNS",
  citilink: "Ситилинк",
  avito: "Avito",
  taobao: "Taobao",
};

export async function searchViaKettu(
  query: string,
  limit = 5,
  onEvent?: (event: SearchEvent) => void,
): Promise<SearchResult[]> {
  const result = await gatewaySearch(query, { limit, onEvent });
  const seen = new Set<string>();
  const rows: SearchResult[] = [];
  for (const group of result.groups) {
    for (const offer of group.offers.filter((o) => o.verified).slice(0, 2)) {
      if (seen.has(offer.url)) continue;
      seen.add(offer.url);
      rows.push({
        id: `${offer.source}-${offer.sourceProductId}`,
        title: offer.title,
        price: offer.effectivePrice ?? offer.price,
        oldPrice: offer.oldPrice ?? null,
        rating: offer.rating ?? null,
        url: offer.url,
        imageUrl: offer.image ?? null,
        source: offer.seller ? `${SOURCE_LABELS[offer.source] ?? offer.source}: ${offer.seller}` : SOURCE_LABELS[offer.source] ?? offer.source,
        verified: offer.verified,
        verificationStatus: offer.verificationStatus,
        promo: offer.promo ?? null,
      });
    }
    if (rows.length >= limit) break;
  }
  return rows.slice(0, limit);
}
