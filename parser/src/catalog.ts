import type { ParsedProduct } from "./types";
import { normalizeProducts, type NormalizedProduct } from "./normalize";
import { filterQuality } from "./quality";
import { groupSimilarProducts, type ProductGroup } from "./matching";
import { analyzePrices, cheapestOffer, type PriceAnalysis } from "./price";

export interface CatalogResult {
  products: NormalizedProduct[];
  groups: Array<ProductGroup & { analysis: PriceAnalysis; cheapest: ParsedProduct }>;
}

export function buildCatalog(products: ParsedProduct[], matchThreshold = 0.72): CatalogResult {
  const qualityProducts = filterQuality(products);
  const normalized = normalizeProducts(qualityProducts);
  const groups = groupSimilarProducts(normalized, matchThreshold);
  return {
    products: normalized,
    groups: groups.map((group) => ({ ...group, analysis: analyzePrices(group), cheapest: cheapestOffer(group) })),
  };
}
