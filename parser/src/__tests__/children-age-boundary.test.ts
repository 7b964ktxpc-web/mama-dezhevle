import { classifyChildProduct } from "../children";

describe("child age boundary", () => {
  it("accepts products ending at 18", () => {
    expect(classifyChildProduct({ title: "Куртка 12-18 лет" }).isChildProduct).toBe(true);
  });

  it("rejects products explicitly starting above 18", () => {
    expect(classifyChildProduct({ title: "Куртка 20-30 лет" }).isChildProduct).toBe(false);
  });

  it("rejects ranges extending beyond 18", () => {
    expect(classifyChildProduct({ title: "Куртка 12-25 лет" }).isChildProduct).toBe(false);
  });
});
