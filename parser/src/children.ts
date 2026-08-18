import type { ParsedProduct } from "./types";

export type ChildAgeBand = "baby" | "toddler" | "preschool" | "school" | "teen" | "unknown";

export interface ChildClassification {
  isChildProduct: boolean;
  ageMin?: number;
  ageMax?: number;
  ageBand: ChildAgeBand;
  confidence: number;
  reasons: string[];
}

const CHILD_POSITIVE = [
  "детск", "ребен", "малыш", "младен", "новорожден", "подрост", "школьник", "baby", "kids", "kid", "teen", "junior",
  "подгуз", "памперс", "смесь", "соска", "бутылоч", "коляск", "автокресл", "пелен", "горшок", "манеж", "прорезыв", "детская одежда",
];
const ADULT_ONLY = ["для взрослых", "взрослый", "adult", "18+", "18 лет и старше"];

function hasAny(text: string, words: string[]): boolean { return words.some((word) => text.includes(word)); }

function ageFromText(text: string): { min?: number; max?: number } {
  const range = text.match(/(?:от\s*)?(\d+)\s*(?:-|–|—|до)\s*(\d+)\s*(?:лет|год|года|мес|месяц)/i);
  if (range) return { min: Number(range[1]), max: Number(range[2]) };
  const under = text.match(/(?:до|under)\s*(\d+)\s*(лет|год|года|мес|месяц)/i);
  if (under) return { max: Number(under[1]) };
  const from = text.match(/(?:от|from)\s*(\d+)\s*(лет|год|года|месяц|месяцев)/i);
  if (from) return { min: Number(from[1]) };
  const months = text.match(/\b(\d+)\s*(мес|месяц|месяцев)\b/i);
  if (months) return { max: Math.ceil(Number(months[1]) / 12) };
  return {};
}

function band(min?: number, max?: number): ChildAgeBand {
  const age = max ?? min;
  if (age === undefined) return "unknown";
  if (age <= 2) return "baby";
  if (age <= 5) return "toddler";
  if (age <= 10) return "preschool";
  if (age <= 14) return "school";
  return "teen";
}

export function classifyChildProduct(product: Pick<ParsedProduct, "title" | "category">): ChildClassification {
  const text = `${product.category ?? ""} ${product.title}`.toLowerCase().replace(/ё/g, "е");
  const reasons: string[] = [];
  if (hasAny(text, ADULT_ONLY)) return { isChildProduct: false, ageBand: "unknown", confidence: 1, reasons: ["adult-only marker"] };

  const age = ageFromText(text);
  const positive = hasAny(text, CHILD_POSITIVE);
  if (positive) reasons.push("child-product keyword");
  if (age.min !== undefined || age.max !== undefined) reasons.push("explicit age marker");

  const explicitAgeOutsideRange = (age.max !== undefined && age.max > 18) || (age.min !== undefined && age.min > 18);
  const hasExplicitChildAge = (age.max !== undefined && age.max <= 18) || (age.min !== undefined && age.min <= 18);
  const isChildProduct = explicitAgeOutsideRange ? false : positive || hasExplicitChildAge;

  return {
    isChildProduct,
    ageMin: age.min,
    ageMax: age.max,
    ageBand: band(age.min, age.max),
    confidence: isChildProduct ? (age.min !== undefined || age.max !== undefined ? 0.98 : 0.82) : (explicitAgeOutsideRange ? 0.98 : 0.05),
    reasons,
  };
}

export function filterChildProducts(products: ParsedProduct[]): ParsedProduct[] {
  return products.filter((product) => classifyChildProduct(product).isChildProduct);
}
