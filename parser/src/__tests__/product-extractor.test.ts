import { extractProducts } from "../product-extractor";

describe("extractProducts", () => {
  it("prefers JSON-LD over fallback metadata", () => {
    const html = `<title>Fallback</title><meta property="og:title" content="Fallback"><meta property="product:price:amount" content="999"><script type="application/ld+json">{"@type":"Product","name":"Pampers Premium Care 4, 104 шт","brand":{"name":"Pampers"},"offers":{"price":"1299","priceCurrency":"RUB"}}</script>`;
    const [product] = extractProducts(html);
    expect(product.source).toBe("jsonld");
    expect(product.price).toBe(1299);
    expect(product.title).toContain("Pampers");
  });

  it("uses fallback when structured data is absent", () => {
    const [product] = extractProducts('<title>Подгузники детские</title><meta property="og:title" content="Подгузники детские"><div>1 299 ₽</div>', "https://example.com/p/1");
    expect(product.source).toBe("fallback");
    expect(product.price).toBe(1299);
  });
});
