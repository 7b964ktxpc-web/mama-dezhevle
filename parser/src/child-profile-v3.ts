import type { ParsedProduct } from "./types";
import { classifyChildProduct } from "./children";
import { classifyChildCategories } from "./children-categories";
import { bestAgeSignal } from "./age-signals";

export interface ChildProfileV3 {
  isChildProduct: boolean;
  score: number;
  ageMin?: number;
  ageMax?: number;
  ageConfidence: number;
  categories: ReturnType<typeof classifyChildCategories>;
  signals: string[];
}

export function buildChildProfileV3(product: Pick<ParsedProduct, "title" | "category">): ChildProfileV3 {
  const text = `${product.category ?? ""} ${product.title}`;
  const base = classifyChildProduct(product);
  const categories = classifyChildCategories(text);
  const best = bestAgeSignal(text);
  const signals: string[] = [];
  const hasCategory = categories[0] !== "other";
  let score = base.isChildProduct ? 55 : 0;
  if (base.isChildProduct) signals.push("child semantic signal");
  if (hasCategory) { score += 20; signals.push(`category:${categories.join(",")}`); }
  if (best) { score += Math.round(best.confidence * 25); signals.push(`age:${best.raw}`); }

  const adult = /\b(?:18\+|18\s*лет\s*и\s*старше|для\s+взросл)/i.test(text);
  if (adult) return { isChildProduct: false, score: 0, ageMin: best?.min, ageMax: best?.max, ageConfidence: best?.confidence ?? 0, categories, signals: [...signals, "adult exclusion"] };

  const ageMin = best?.min;
  const ageMax = best?.max;
  const explicitChildAge = !!best && best.confidence >= 0.9 && (ageMin === undefined || ageMin <= 18) && (ageMax === undefined || ageMax <= 18);
  const isChildProduct = score >= 55 && (explicitChildAge || hasCategory || base.isChildProduct);
  return { isChildProduct, score: Math.min(100, score), ageMin, ageMax, ageConfidence: best?.confidence ?? 0, categories, signals };
}
