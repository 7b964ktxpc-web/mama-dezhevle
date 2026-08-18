import type { ParsedProduct } from "./types";
import { validateProduct } from "./quality";

export interface CollectionMetrics {
  total: number;
  valid: number;
  rejected: number;
  marketplaces: Record<string, number>;
  averagePrice?: number;
  minPrice?: number;
  maxPrice?: number;
}

export function collectionMetrics(products: ParsedProduct[]): CollectionMetrics {
  const marketplaces: Record<string, number> = {};
  const validProducts: ParsedProduct[] = [];
  for (const product of products) {
    marketplaces[product.marketplace] = (marketplaces[product.marketplace] ?? 0) + 1;
    if (validateProduct(product).valid) validProducts.push(product);
  }
  const prices = validProducts.map((p) => p.price).filter(Number.isFinite);
  return {
    total: products.length,
    valid: validProducts.length,
    rejected: products.length - validProducts.length,
    marketplaces,
    averagePrice: prices.length ? prices.reduce((a, b) => a + b, 0) / prices.length : undefined,
    minPrice: prices.length ? Math.min(...prices) : undefined,
    maxPrice: prices.length ? Math.max(...prices) : undefined,
  };
}
