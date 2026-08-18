import type { ParsedProduct } from "../types";
import { normalizeOffer } from "../offer-normalize";

export interface ProductLike {
  title: string;
  brand?: string;
  price: number;
  oldPrice?: number;
  currency?: string;
  available?: boolean;
  url?: string;
}

export function fixtureToParsedProduct(input: ProductLike, marketplace: string, externalId: string, sourceUrl: string): ParsedProduct {
  const offer = normalizeOffer({ price: input.price, oldPrice: input.oldPrice, availability: input.available });
  return {
    marketplace: marketplace as ParsedProduct["marketplace"],
    externalId,
    title: input.title,
    brand: input.brand,
    price: offer.price ?? input.price,
    oldPrice: offer.oldPrice,
    available: offer.availability,
    currency: input.currency ?? "RUB",
    url: input.url ?? sourceUrl,
    sourceUrl,
    collectedAt: new Date().toISOString(),
  };
}
