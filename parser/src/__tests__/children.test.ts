import { classifyChildProduct, filterChildProducts } from "../children";
import type { ParsedProduct } from "../types";

const product = (title: string): ParsedProduct => ({ marketplace: "ozon", externalId: title, title, url: "https://www.ozon.ru/product/x", price: 100, currency: "RUB", sourceUrl: "https://www.ozon.ru/product/x", collectedAt: new Date().toISOString() });

describe("classifyChildProduct", () => {
  it("accepts explicit age up to 18", () => {
    expect(classifyChildProduct(product("Куртка для детей 12-18 лет")).isChildProduct).toBe(true);
  });
  it("accepts baby products", () => {
    expect(classifyChildProduct(product("Подгузники для новорожденных")).isChildProduct).toBe(true);
  });
  it("rejects adult-only products", () => {
    expect(classifyChildProduct(product("Косметика для взрослых 18+")).isChildProduct).toBe(false);
  });
  it("accepts teen products without requiring an explicit age", () => {
    expect(classifyChildProduct(product("Кроссовки подростковые")).isChildProduct).toBe(true);
  });
});

describe("filterChildProducts", () => {
  it("keeps only child products", () => {
    expect(filterChildProducts([product("Детская куртка"), product("Мужская куртка")])).toHaveLength(1);
  });
});
