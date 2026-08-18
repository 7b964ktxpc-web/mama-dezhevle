import { comparePriceRegressionCases } from "../compare";

describe("comparePrices regression cases", () => {
  it("groups the same product across marketplaces", () => {
    const result = comparePriceRegressionCases().sameProductDifferentMarketplaces;
    expect(result).toHaveLength(1);
    expect(result[0].cheapest.price).toBe(1090);
    expect(result[0].marketplaceCount).toBe(2);
  });

  it("does not merge different pack sizes", () => {
    const result = comparePriceRegressionCases().differentPacks;
    expect(result.length).toBeGreaterThan(1);
  });

  it("does not merge different sizes", () => {
    const result = comparePriceRegressionCases().differentSizes;
    expect(result.length).toBeGreaterThan(1);
  });
});
