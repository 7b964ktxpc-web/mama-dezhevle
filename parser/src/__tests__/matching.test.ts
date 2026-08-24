import { groupSimilarProducts, productSimilarity } from "../matching";
import type { ParsedProduct } from "../types";

const product = (title: string, brand = "Pampers"): ParsedProduct => ({ marketplace: "ozon", externalId: title, title, brand, url: "https://www.ozon.ru/product/x", price: 100, currency: "RUB", sourceUrl: "https://www.ozon.ru/product/x", collectedAt: new Date().toISOString() });

describe("productSimilarity", () => {
  it("recognizes equivalent titles with different punctuation", () => {
    expect(productSimilarity(product("Premium Care 4 104 шт"), product("Premium Care №4 — 104 шт"))).toBeGreaterThan(0.72);
  });
  it("separates different pack sizes", () => {
    expect(productSimilarity(product("Premium Care 4 104 шт"), product("Premium Care 4 52 шт"))).toBeLessThan(0.72);
  });
});

describe("groupSimilarProducts", () => {
  it("groups equivalent offers", () => {
    const groups = groupSimilarProducts([
      product("Premium Care 4 104 шт"),
      { ...product("Premium Care №4 — 104 шт"), marketplace: "wildberries" },
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0].offers).toHaveLength(2);
  });
});
