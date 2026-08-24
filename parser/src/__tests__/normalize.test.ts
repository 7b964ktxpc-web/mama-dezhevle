import { normalizeProduct, normalizeTitle } from "../normalize";
import type { ParsedProduct } from "../types";

const product = (title: string): ParsedProduct => ({ marketplace: "ozon", externalId: title, title, url: "https://www.ozon.ru/product/x", price: 100, currency: "RUB", sourceUrl: "https://www.ozon.ru/product/x", collectedAt: new Date().toISOString() });

describe("normalizeTitle", () => {
  it("normalizes russian ё and marketplace noise", () => {
    expect(normalizeTitle("Подгузники Ёжик — купить, доставка, скидка")).toBe("подгузники ежик");
  });
});

describe("normalizeProduct", () => {
  it("converts kilograms to grams", () => {
    expect(normalizeProduct(product("Смесь 1,5 кг")).weightGrams).toBe(1500);
  });
  it("converts liters to milliliters", () => {
    expect(normalizeProduct(product("Шампунь 1.5 л")).volumeMl).toBe(1500);
  });
  it("does not invent pack count when number is a size", () => {
    expect(normalizeProduct(product("Подгузники размер 4")).packCount).toBeUndefined();
  });
  it("reads explicit item count", () => {
    expect(normalizeProduct(product("Салфетки 72 шт")).packCount).toBe(72);
  });
});
