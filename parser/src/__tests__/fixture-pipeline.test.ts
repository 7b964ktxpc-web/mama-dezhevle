import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parseProductJsonLd } from "../fixtures/parse-fixture";
import { fixtureToParsedProduct } from "../fixtures/to-parsed-product";
import { buildChildProfileV2 } from "../child-profile-v2";
import { marketplaceProductKey } from "../marketplace-key";

describe("fixture product pipeline", () => {
  it("turns marketplace HTML into a child ParsedProduct", () => {
    const html = readFileSync(resolve(process.cwd(), "parser/src/fixtures/ozon-product.html"), "utf8");
    const [fixture] = parseProductJsonLd(html);
    const product = fixtureToParsedProduct(fixture, "ozon", "fixture-1", "https://www.ozon.ru/product/example");
    const profile = buildChildProfileV2(product);
    const key = marketplaceProductKey(product);

    expect(product.price).toBe(1299);
    expect(product.brand).toBe("Pampers");
    expect(profile.isChildProduct).toBe(true);
    expect(profile.categories).toContain("diapers");
    expect(key.exact).toBe("ozon:fixture-1");
  });
});
