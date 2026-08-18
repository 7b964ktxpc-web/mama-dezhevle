import { dedupeProducts } from "../dedupe";
import type { Marketplace, ParsedProduct } from "../types";

const product = (marketplace: Marketplace, externalId: string, title: string): ParsedProduct => ({ marketplace, externalId, title, brand: "Pampers", url: `https://${marketplace}.example/item/${externalId}`, price: 100, currency: "RUB", sourceUrl: `https://${marketplace}.example`, collectedAt: new Date().toISOString() });

describe("dedupeProducts", () => {
  it("removes the same marketplace item twice", () => {
    const result = dedupeProducts([product("ozon", "1", "Pampers Premium Care 4"), product("ozon", "1", "Pampers Premium Care 4")]);
    expect(result.products).toHaveLength(1);
    expect(result.duplicates).toBe(1);
  });
  it("removes the same canonical product across marketplaces", () => {
    const result = dedupeProducts([product("ozon", "1", "Pampers Premium Care 4"), product("wildberries", "2", "Pampers Premium Care 4")]);
    expect(result.products).toHaveLength(1);
    expect(result.duplicates).toBe(1);
  });
});
