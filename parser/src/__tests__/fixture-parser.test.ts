import { extractJsonLdProducts } from "../fixture-parser";
import { ozonProductFixture, wildberriesProductFixture, adultFixture } from "../fixtures/marketplaces";

describe("extractJsonLdProducts", () => {
  it("extracts an Ozon-like product fixture", () => {
    const products = extractJsonLdProducts(ozonProductFixture, "ozon", "https://ozon.example/product/1");
    expect(products).toHaveLength(1);
    expect(products[0].brand).toBe("Pampers");
    expect(products[0].price).toBe(1299);
  });
  it("extracts a Wildberries-like product fixture", () => {
    const products = extractJsonLdProducts(wildberriesProductFixture, "wildberries", "https://wildberries.example/product/2");
    expect(products).toHaveLength(1);
    expect(products[0].price).toBe(1199);
  });
  it("does not filter adult products at extraction stage", () => {
    expect(extractJsonLdProducts(adultFixture, "ozon", "https://ozon.example/product/3")).toHaveLength(1);
  });
});
