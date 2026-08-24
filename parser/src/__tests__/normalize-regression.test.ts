import { normalizeProduct } from "../normalize";
import type { ParsedProduct } from "../types";

const product = (title: string): ParsedProduct => ({ marketplace: "ozon", externalId: title, title, url: "https://www.ozon.ru/product/x", price: 100, currency: "RUB", sourceUrl: "https://www.ozon.ru/product/x", collectedAt: new Date().toISOString() });

describe("normalization regressions", () => {
  it("preserves pack count even though шт is removable title noise", () => {
    expect(normalizeProduct(product("Салфетки 72 шт купить")).packCount).toBe(72);
  });
  it("keeps diaper size separate from pack count", () => {
    const result = normalizeProduct(product("Подгузники размер 4 104 шт"));
    expect(result.sizeLabel).toBe("4");
    expect(result.packCount).toBe(104);
  });
  it("does not interpret a plain model number as pack count", () => {
    expect(normalizeProduct(product("Коляска модель 4 купить")).packCount).toBeUndefined();
  });
});
