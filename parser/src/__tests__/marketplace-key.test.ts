import { marketplaceProductKey } from "../marketplace-key";

describe("marketplaceProductKey", () => {
  it("keeps marketplace ids exact", () => {
    const key = marketplaceProductKey({ marketplace: "Ozon", externalId: "ABC-123", title: "Test", brand: "Brand" });
    expect(key.exact).toBe("ozon:abc-123");
  });
  it("builds a cross-market canonical key", () => {
    const a = marketplaceProductKey({ marketplace: "ozon", externalId: "1", title: "Pampers Premium Care 4", brand: "Pampers" });
    const b = marketplaceProductKey({ marketplace: "wildberries", externalId: "2", title: "Pampers Premium Care 4", brand: "Pampers" });
    expect(a.canonical).toBe(b.canonical);
  });
});
