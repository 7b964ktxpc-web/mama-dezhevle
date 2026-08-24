import type { ParsedProduct } from "./types";

export interface QualityReport {
  valid: boolean;
  score: number;
  warnings: string[];
}

export function validateProduct(product: ParsedProduct): QualityReport {
  const warnings: string[] = [];
  let score = 100;
  if (!product.title.trim()) { warnings.push("missing title"); score -= 40; }
  if (!product.url.startsWith("https://")) { warnings.push("invalid product URL"); score -= 25; }
  if (!Number.isFinite(product.price) || product.price <= 0) { warnings.push("invalid price"); score -= 40; }
  if (!product.externalId.trim()) { warnings.push("missing external id"); score -= 20; }
  if (!product.currency) { warnings.push("missing currency"); score -= 5; }
  if (product.oldPrice !== undefined && product.oldPrice < product.price) { warnings.push("old price below current price"); score -= 15; }
  if (product.rating !== undefined && (product.rating < 0 || product.rating > 5)) { warnings.push("rating outside 0..5"); score -= 15; }
  if (product.reviewsCount !== undefined && product.reviewsCount < 0) { warnings.push("negative review count"); score -= 10; }
  return { valid: score >= 60 && !warnings.includes("invalid price"), score: Math.max(0, score), warnings };
}

export function filterQuality(products: ParsedProduct[], minimumScore = 60): ParsedProduct[] {
  return products.filter((product) => validateProduct(product).score >= minimumScore);
}
