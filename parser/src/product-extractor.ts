import { parseProductJsonLd } from "./fixtures/parse-fixture";
import { extractFallbackProductData } from "./fallback-extractor";

export interface ExtractedProduct {
  title?: string;
  brand?: string;
  price?: number;
  currency?: string;
  url?: string;
  source: "jsonld" | "fallback";
}

export function extractProducts(html: string, pageUrl?: string): ExtractedProduct[] {
  const structured = parseProductJsonLd(html);
  if (structured.length) return structured.map((item) => ({ ...item, source: "jsonld" }));
  const fallback = extractFallbackProductData(html, pageUrl);
  if (!fallback.title || fallback.price === undefined) return [];
  return [{ ...fallback, source: "fallback" }];
}
