import type { ParsedProduct } from "./types";
import { normalizeProduct } from "./normalize";

export interface ProductIdentity {
  brand?: string;
  model?: string;
  size?: string;
  quantity?: string;
  variant?: string;
}

const STOP_WORDS = new Set([
  "купить", "цена", "скидка", "доставка", "руб", "рублей", "новинка",
  "оригинал", "товар", "шт", "штук", "упаковка", "уп", "для", "и", "в", "на",
]);

function normalizeText(value: string): string {
  return value.toLowerCase().replace(/ё/g, "е").replace(/№/g, " ").replace(/&amp;/g, " ").replace(/[^a-zа-я0-9%./-]+/gi, " ").replace(/\s+/g, " ").trim();
}

function tokens(value: string): string[] {
  return normalizeText(value).split(" ").filter((token) => token.length > 1 && !STOP_WORDS.has(token));
}

export function extractIdentity(product: Pick<ParsedProduct, "title" | "brand">): ProductIdentity {
  const title = normalizeText(product.title);
  const normalized = normalizeProduct(product as ParsedProduct);
  const quantity = normalized.packCount !== undefined ? `${normalized.packCount} шт` : title.match(/\b(\d+(?:[.,]\d+)?)\s*(шт|штук)\b/i)?.[0];
  const size = title.match(/\b(?:размер|size)\s*([0-9a-zа-я+-]+)\b/i)?.[1]
    ?? title.match(/\b(?:размер\s*)?(?:№\s*)?(\d+)\b(?=\s*(?:шт|штук|$))/i)?.[1];
  const model = title.match(/\b([a-z]{1,8}[ -]?[a-z0-9]{1,12}\d+[a-z0-9-]*)\b/i)?.[1];
  return {
    brand: product.brand ? normalizeText(product.brand) : undefined,
    model,
    size,
    quantity: quantity ? normalizeText(quantity) : undefined,
  };
}

function jaccard(a: string[], b: string[]): number {
  const A = new Set(a);
  const B = new Set(b);
  const intersection = [...A].filter((value) => B.has(value)).length;
  const union = new Set([...A, ...B]).size;
  return union ? intersection / union : 0;
}

export function productSimilarity(a: ParsedProduct, b: ParsedProduct): number {
  const aTokens = tokens(`${a.brand ?? ""} ${a.title}`);
  const bTokens = tokens(`${b.brand ?? ""} ${b.title}`);
  const ai = extractIdentity(a);
  const bi = extractIdentity(b);

  if (ai.brand && bi.brand && ai.brand !== bi.brand) return 0;
  if (ai.quantity && bi.quantity && ai.quantity !== bi.quantity) return 0;
  if (ai.size && bi.size && ai.size !== bi.size) return 0;
  if (ai.model && bi.model && ai.model !== bi.model) return 0;

  let score = jaccard(aTokens, bTokens);
  if (ai.brand && bi.brand) score += 0.18;
  if (ai.model && bi.model) score += 0.25;
  if (ai.size && bi.size) score += 0.10;
  if (ai.quantity && bi.quantity) score += 0.15;

  return Math.max(0, Math.min(1, score));
}

export interface ProductGroup {
  canonical: ParsedProduct;
  offers: ParsedProduct[];
}

export function groupSimilarProducts(products: ParsedProduct[], threshold = 0.72): ProductGroup[] {
  const groups: ProductGroup[] = [];
  for (const product of products) {
    let bestGroup: ProductGroup | undefined;
    let bestScore = 0;
    for (const group of groups) {
      const score = productSimilarity(product, group.canonical);
      if (score > bestScore) {
        bestScore = score;
        bestGroup = group;
      }
    }
    if (bestGroup && bestScore >= threshold) {
      bestGroup.offers.push(product);
      if (product.title.length < bestGroup.canonical.title.length) bestGroup.canonical = product;
    } else {
      groups.push({ canonical: product, offers: [product] });
    }
  }
  return groups;
}
