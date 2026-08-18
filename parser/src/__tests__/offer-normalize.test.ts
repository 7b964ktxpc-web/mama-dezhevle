import { normalizeOffer } from "../offer-normalize";

describe("normalizeOffer", () => {
  it("calculates a valid discount", () => {
    expect(normalizeOffer({ price: "799", oldPrice: "999" })).toMatchObject({ price: 799, oldPrice: 999, discountPercent: 20 });
  });
  it("rejects fake old prices", () => {
    expect(normalizeOffer({ price: 999, oldPrice: 799 }).oldPrice).toBeUndefined();
  });
  it("normalizes availability", () => {
    expect(normalizeOffer({ price: 100, availability: "В наличии" }).availability).toBe(true);
    expect(normalizeOffer({ price: 100, availability: "Нет в наличии" }).availability).toBe(false);
  });
});
