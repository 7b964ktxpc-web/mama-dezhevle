import type { ParsedProduct } from "./types";
import { marketplaceProductKey } from "./marketplace-key";

export interface DedupedProducts {
  products: ParsedProduct[];
  duplicates: number;
}

export function dedupeProducts(products: ParsedProduct[]): DedupedProducts {
  const seenExact = new Set<string>();
  const seenCanonical = new Set<string>();
  const result: ParsedProduct[] = [];
  let duplicates = 0;

  for (const product of products) {
    const key = marketplaceProductKey(product);
    if (seenExact.has(key.exact) || seenCanonical.has(key.canonical)) {
      duplicates += 1;
      continue;
    }
    seenExact.add(key.exact);
    seenCanonical.add(key.canonical);
    result.push(product);
  }
  return { products: result, duplicates };
}
