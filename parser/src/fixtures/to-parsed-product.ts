import type { ParsedProduct } from "../types";
import type { FixtureProduct } from "./parse-fixture";

export function fixtureToParsedProduct(input: FixtureProduct, marketplace: string, externalId: string, sourceUrl: string): ParsedProduct {
  return {
    marketplace,
    externalId,
    title: input.title,
    brand: input.brand,
    price: input.price,
    currency: input.currency,
    url: input.url ?? sourceUrl,
    sourceUrl,
    collectedAt: new Date().toISOString(),
  };
}
