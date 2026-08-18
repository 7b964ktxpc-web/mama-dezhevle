import { comparePrices } from "./engine";
import type { ParsedProduct } from "./types";

const product = (marketplace: string, id: string, title: string, price: number): ParsedProduct => ({ marketplace, externalId: id, title, brand: "Pampers", url: `https://${marketplace}.example/${id}`, price, currency: "RUB", sourceUrl: `https://${marketplace}.example`, collectedAt: new Date().toISOString() });

export function comparePriceRegressionCases() {
  return {
    sameProductDifferentMarketplaces: comparePrices([
      product("ozon", "1", "Pampers Premium Care 4", 1200),
      product("wildberries", "2", "Pampers Premium Care 4", 1090),
    ]),
    differentPacks: comparePrices([
      product("ozon", "1", "Pampers Premium Care 4 104 шт", 1200),
      product("wildberries", "2", "Pampers Premium Care 4 52 шт", 700),
    ]),
    differentSizes: comparePrices([
      product("ozon", "1", "Pampers Premium Care 4", 1200),
      product("wildberries", "2", "Pampers Premium Care 5", 1200),
    ]),
  };
}
