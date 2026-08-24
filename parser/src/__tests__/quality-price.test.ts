import { validateProduct } from "../quality";
import { analyzePrices } from "../price";
import type { ParsedProduct } from "../types";

afterEach(() => undefined);

const product = (price: number, oldPrice?: number): ParsedProduct => ({ marketplace: "ozon", externalId: String(price), title: "Test product", url: "https://www.ozon.ru/product/x", price, oldPrice, currency: "RUB", sourceUrl: "https://www.ozon.ru/product/x", collectedAt: new Date().toISOString() });

describe("validateProduct", () => {
  it("rejects zero and negative prices", () => {
    expect(validateProduct(product(0)).valid).toBe(false);
    expect(validateProduct(product(-10)).valid).toBe(false);
  });
  it("flags an invalid old price", () => {
    expect(validateProduct(product(100, 90)).warnings).toContain("old price below current price");
  });
});

describe("analyzePrices", () => {
  it("finds the cheapest offer and keeps score bounded", () => {
    const result = analyzePrices({ canonical: product(100), offers: [product(100), { ...product(150), marketplace: "wildberries" }] });
    expect(result.current).toBe(100);
    expect(result.minimum).toBe(100);
    expect(result.maximum).toBe(150);
    expect(result.dealScore).toBeGreaterThanOrEqual(0);
    expect(result.dealScore).toBeLessThanOrEqual(100);
  });
});
