import type { Product } from "../types";

/**
 * Common contract for every permitted marketplace/catalog source.
 * A source may later be backed by an official API, affiliate feed, or another
 * permitted machine-readable endpoint without changing the collector.
 */
export type ProductSource = {
  id: string;
  name: string;
  isEnabled: () => boolean;
  collect: () => Promise<Product[]> | Product[];
};
