import { buildChildProfileV2 } from "../child-profile-v2";

const product = (title: string, category?: string) => ({ title, category });

describe("child profile v2", () => {
  it("scores explicit child age and category highly", () => {
    const result = buildChildProfileV2(product("Куртка детская 12-18 лет", "Одежда"));
    expect(result.isChildProduct).toBe(true);
    expect(result.score).toBeGreaterThanOrEqual(80);
    expect(result.ageMax).toBe(18);
  });
  it("rejects explicit adult products even with child-like words", () => {
    const result = buildChildProfileV2(product("Детская коллекция для взрослых 18+"));
    expect(result.isChildProduct).toBe(false);
    expect(result.score).toBe(0);
  });
  it("does not classify a generic adult product from a number alone", () => {
    const result = buildChildProfileV2(product("Кроссовки модель 2026"));
    expect(result.isChildProduct).toBe(false);
  });
});
