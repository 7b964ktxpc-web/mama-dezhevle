import type { ParsedProduct } from "./types";
import { fingerprint } from "./fingerprint";

export interface MarketplaceProductKey {
  exact: string;
  canonical: string;
}

export function marketplaceProductKey(product: Pick<ParsedProduct, "marketplace" | "externalId" | "title" | "brand">): MarketplaceProductKey {
  const marketplace = product.marketplace.trim().toLowerCase();
  const externalId = product.externalId.trim().toLowerCase();
  const exact = `${marketplace}:${externalId}`;
  const canonical = fingerprint(product).key;
  return { exact, canonical };
}
