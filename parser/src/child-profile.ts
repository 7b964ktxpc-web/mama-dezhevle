import type { ParsedProduct } from "./types";
import { classifyChildProduct, type ChildClassification } from "./children";
import { classifyChildCategories, type ChildCategory } from "./children-categories";

export interface ChildProductProfile {
  isChildProduct: boolean;
  age: ChildClassification;
  categories: ChildCategory[];
  confidence: number;
}

export function buildChildProfile(product: Pick<ParsedProduct, "title" | "category">): ChildProductProfile {
  const age = classifyChildProduct(product);
  const categories = classifyChildCategories(`${product.category ?? ""} ${product.title}`);
  const categorySignal = categories[0] !== "other" ? 0.12 : 0;
  return {
    isChildProduct: age.isChildProduct,
    age,
    categories,
    confidence: Math.min(1, age.confidence + categorySignal),
  };
}

export function filterByChildProfile(products: ParsedProduct[], minConfidence = 0.5): ParsedProduct[] {
  return products.filter((product) => {
    const profile = buildChildProfile(product);
    return profile.isChildProduct && profile.confidence >= minConfidence;
  });
}
