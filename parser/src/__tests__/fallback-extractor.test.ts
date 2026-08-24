import { extractFallbackProductData } from "../fallback-extractor";

describe("extractFallbackProductData", () => {
  it("extracts OpenGraph metadata and price", () => {
    const html = `<html><head><title>Детская куртка</title><meta property="og:title" content="Куртка детская 122 см"><meta property="product:brand" content="Acme"><meta property="product:price:amount" content="1 499"><meta property="product:price:currency" content="RUB"><meta property="og:url" content="https://example.com/p/1"></head></html>`;
    const result = extractFallbackProductData(html);
    expect(result.title).toBe("Куртка детская 122 см");
    expect(result.brand).toBe("Acme");
    expect(result.price).toBe(1499);
    expect(result.currency).toBe("RUB");
  });

  it("falls back to visible price text", () => {
    const result = extractFallbackProductData("<title>Подгузники детские</title><div>1 299 ₽</div>");
    expect(result.price).toBe(1299);
  });
});
