import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createJsonLdAdapter } from "../adapters/jsonld-adapter";
import { createAdapterRegistry } from "../adapters/registry";

describe("marketplace adapters", () => {
  const ozon = createJsonLdAdapter("ozon", ["ozon.ru"]);
  const wb = createJsonLdAdapter("wildberries", ["wildberries.ru"]);
  const registry = createAdapterRegistry([ozon, wb]);

  it("routes supported hosts", () => {
    expect(registry.forHost("www.ozon.ru")?.marketplace).toBe("ozon");
    expect(registry.forHost("www.wildberries.ru")?.marketplace).toBe("wildberries");
    expect(registry.forHost("example.com")).toBeUndefined();
  });

  it("parses the Ozon fixture through an adapter", () => {
    const html = readFileSync(resolve(process.cwd(), "parser/src/fixtures/ozon-product.html"), "utf8");
    const products = ozon.parse(new URL("https://www.ozon.ru/product/example"), html);
    expect(products).toHaveLength(1);
    expect(products[0].marketplace).toBe("ozon");
    expect(products[0].price).toBe(1299);
  });
});
