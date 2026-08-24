import type { ParsedProduct } from "./types";
import { classifyChildProduct } from "./children";
import { classifyChildCategories } from "./children-categories";
import { extractAgeSignals, bestAgeSignal } from "./age-signals";

export interface ChildProfileV2 {
  isChildProduct: boolean;
  score: number;
  ageMin?: number;
  ageMax?: number;
  ageConfidence: number;
  categories: ReturnType<typeof classifyChildCategories>;
  signals: string[];
}

export function buildChildProfileV2(product: Pick<ParsedProduct, "title" | "category">): ChildProfileV2 {
  const text = `${product.category ?? ""} ${product.title}`;
  const base = classifyChildProduct(product);
  const categories = classifyChildCategories(text);
  const ageSignals = extractAgeSignals(text);
  const best = bestAgeSignal(text);
  const signals: string[] = [];
  let score = 0;

  if (base.isChildProduct) { score += 55; signals.push("child semantic signal"); }
  if (categories[0] !== "other") { score += 20; signals.push(`category:${categories.join(",")}`); }
  if (best) { score += Math.round(best.confidence * 25); signals.push(`age:${best.raw}`); }

  const adult18 = /\b(?:18\+|18\s*лет\s*и\s*старше|для\s+взросл)/i.test(text);
  if (adult18) { score = 0; signals.push("adult exclusion"); }

  const ageMax = best?.max;
  const ageMin = best?.min;
  const withinChildRange = ageMin === undefined || ageMin <= 18;
  const isChildProduct = !adult18 && withinChildRange && score >= 55;

  return {
    isChildProduct,
    score: Math.min(100, score),
    ageMin,
    ageMax,
    ageConfidence: best?.confidence ?? 0,
    categories,
    signals,
  };
}
