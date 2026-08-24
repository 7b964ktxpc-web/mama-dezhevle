import { normalizeProduct } from "../normalize";
import type { ParsedProduct } from "../types";

const product = (title: string, price: number): ParsedProduct => ({ marketplace: "ozon", externalId: title, title, url: "https://www.ozon.ru/product/x", price, currency: "RUB", sourceUrl: "https://www.ozon.ru/product/x", collectedAt: new Date().toISOString() });

describe("unit price normalization", () => {
  it("calculates price per item", () => {
    const result = normalizeProduct(product("Салфетки детские 72 шт", 720));
    expect(result.unitPrice).toBe(10);
    expect(result.unitBasis).toBe("item");
  });

  it("calculates price per kilogram", () => {
    const result = normalizeProduct(product("Смесь детская 1,5 кг", 900));
    expect(result.unitPrice).toBe(600);
    expect(result.unitBasis).toBe("kg");
  });

  it("calculates price per liter", () => {
    const result = normalizeProduct(product("Шампунь детский 500 мл", 250));
    expect(result.unitPrice).toBe(500);
    expect(result.unitBasis).toBe("l");
  });
});
