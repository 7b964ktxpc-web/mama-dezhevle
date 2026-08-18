import { adapters } from "../adapters";

describe("layered marketplace adapter", () => {
  it("uses fallback when JSON-LD is missing", () => {
    const html = '<meta property="og:title" content="Подгузники детские"><meta property="product:price:amount" content="1 299"><meta property="product:price:currency" content="RUB">';
    const adapter = adapters.find((item) => item.id === "ozon")!;
    const [product] = adapter.parse(new URL("https://www.ozon.ru/product/test"), html, {});
    expect(product.marketplace).toBe("ozon");
    expect(product.title).toBe("Подгузники детские");
    expect(product.price).toBe(1299);
  });

  it("uses JSON-LD when both sources exist", () => {
    const html = '<meta property="og:title" content="Fallback"><meta property="product:price:amount" content="999"><script type="application/ld+json">{"@type":"Product","name":"Pampers Premium Care 4","offers":{"price":"1299","priceCurrency":"RUB"}}</script>';
    const adapter = adapters.find((item) => item.id === "ozon")!;
    const [product] = adapter.parse(new URL("https://www.ozon.ru/product/test"), html, {});
    expect(product.title).toBe("Pampers Premium Care 4");
    expect(product.price).toBe(1299);
  });
});
