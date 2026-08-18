import type { ParsedProduct } from "./types";
import { marketplaceProductKey } from "./marketplace-key";

export interface DedupedProducts {
  products: ParsedProduct[];
  duplicates: number;
}

/**
 * Removes duplicate listings, but never removes an equivalent offer merely
 * because it was found on another marketplace. Cross-marketplace equivalents
 * are required later by matching/comparison.
 */
export function dedupeProducts(products: ParsedProduct[]): DedupedProducts {
  const seenExact = new Set<string>();
  const result: ParsedProduct[] = [];
  let duplicates = 0;

  for (const product of products) {
    const key = marketplaceProductKey(product);
    if (seenExact.has(key.exact)) {
      duplicates += 1;
      continue;
    }
    seenExact.add(key.exact);
    result.push(product);
  }

  return { products: result, duplicates };
}
