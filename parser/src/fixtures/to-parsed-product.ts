import type { ParsedProduct } from "../types";
import type { FixtureProduct } from "./parse-fixture";
import { normalizeOffer } from "../offer-normalize";

export function fixtureToParsedProduct(input: FixtureProduct, marketplace: string, externalId: string, sourceUrl: string): ParsedProduct {
  const offer = normalizeOffer({ price: input.price, oldPrice: input.oldPrice, availability: input.available });
  return {
    marketplace: marketplace as ParsedProduct["marketplace"],
    externalId,
    title: input.title,
    brand: input.brand,
    price: offer.price ?? input.price,
    oldPrice: offer.oldPrice,
    available: offer.availability,
    currency: input.currency,
    url: input.url ?? sourceUrl,
    sourceUrl,
    collectedAt: new Date().toISOString(),
  };
}
