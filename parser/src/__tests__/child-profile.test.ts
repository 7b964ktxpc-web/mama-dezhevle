import { buildChildProfile, filterByChildProfile } from "../child-profile";
import type { ParsedProduct } from "../types";

const product = (title: string, category?: string): ParsedProduct => ({ marketplace: "ozon", externalId: title, title, category, url: "https://www.ozon.ru/product/x", price: 100, currency: "RUB", sourceUrl: "https://www.ozon.ru/product/x", collectedAt: new Date().toISOString() });

describe("buildChildProfile", () => {
  it("combines age and category signals", () => {
    const profile = buildChildProfile(product("Куртка для девочки 12-18 лет"));
    expect(profile.isChildProduct).toBe(true);
    expect(profile.categories).toContain("clothing");
    expect(profile.age.ageMax).toBe(18);
    expect(profile.confidence).toBeGreaterThan(0.9);
  });
});

describe("filterByChildProfile", () => {
  it("removes weak non-child matches", () => {
    expect(filterByChildProfile([product("Куртка детская"), product("Мужская куртка")])).toHaveLength(1);
  });
});
