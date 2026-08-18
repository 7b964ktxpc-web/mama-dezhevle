import { productSimilarity } from "../matching";
import type { ParsedProduct } from "../types";

const product = (title: string, brand = "Pampers"): ParsedProduct => ({ marketplace: "ozon", externalId: title, title, brand, url: "https://www.ozon.ru/product/x", price: 100, currency: "RUB", sourceUrl: "https://www.ozon.ru/product/x", collectedAt: new Date().toISOString() });

describe("variant matching", () => {
  it("rejects different explicit pack counts", () => {
    expect(productSimilarity(product("Premium Care 4 104 шт"), product("Premium Care 4 52 шт"))).toBe(0);
  });

  it("rejects different explicit sizes", () => {
    expect(productSimilarity(product("Premium Care 4"), product("Premium Care 5"))).toBe(0);
  });

  it("accepts punctuation-only title differences", () => {
    expect(productSimilarity(product("Premium Care 4 104 шт"), product("Premium Care №4 — 104 шт"))).toBeGreaterThan(0.72);
  });
});
