import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parseProductJsonLd } from "../fixtures/parse-fixture";

describe("parseProductJsonLd", () => {
  it("extracts Ozon price, old price and availability", () => {
    const html = readFileSync(resolve(process.cwd(), "parser/src/fixtures/ozon-product.html"), "utf8");
    const [product] = parseProductJsonLd(html);
    expect(product.title).toContain("Pampers Premium Care 4");
    expect(product.brand).toBe("Pampers");
    expect(product.price).toBe(1299);
    expect(product.oldPrice).toBe(1599);
    expect(product.currency).toBe("RUB");
    expect(product.available).toBe(true);
  });
  it("extracts the Wildberries fixture", () => {
    const html = readFileSync(resolve(process.cwd(), "parser/src/fixtures/wb-product.html"), "utf8");
    const [product] = parseProductJsonLd(html);
    expect(product.price).toBe(1190);
    expect(product.title).toContain("104 шт");
  });
  it("ignores malformed JSON-LD without crashing", () => {
    expect(parseProductJsonLd('<script type="application/ld+json">{broken</script>')).toEqual([]);
  });
});
