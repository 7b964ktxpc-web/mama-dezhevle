import { getSupabaseAdmin } from "./supabase-admin";

export type SearchFilters = {
  terms: string[];
  maxPrice?: number;
  age?: number;
  size?: number;
  gender?: "мальчик" | "девочка";
};

export type SearchResult = {
  id: string | number;
  title: string;
  price: number;
  oldPrice?: number | null;
  rating?: number | null;
  url: string;
  imageUrl?: string | null;
};

export function parseSearchQuery(query: string): SearchFilters {
  const normalized = query.toLowerCase().replace(/ё/g, "е");

  const maxPriceMatch = normalized.match(/(?:до|<=|не дороже)\s*(\d[\d\s]*(?:[.,]\d+)?)\s*(?:₽|руб(?:лей|ля)?\.?)?/i);
  const maxPrice = maxPriceMatch
    ? Number(maxPriceMatch[1].replace(/\s/g, "").replace(",", "."))
    : undefined;

  const ageMatch = normalized.match(/(?:на\s*)?(\d{1,2})\s*(?:лет|года|год|г\.?)/i);
  const age = ageMatch ? Number(ageMatch[1]) : undefined;

  const sizeMatch = normalized.match(/(?:размер\s*)?(\d{2,3})\s*(?:см)?\b/i);
  const size = sizeMatch ? Number(sizeMatch[1]) : undefined;

  const gender = normalized.includes("мальчик") || normalized.includes("сын")
    ? "мальчик"
    : normalized.includes("девоч") || normalized.includes("дочь")
      ? "девочка"
      : undefined;

  const cleaned = normalized
    .replace(/(?:до|<=|не дороже)\s*\d[\d\s]*(?:[.,]\d+)?\s*(?:₽|руб(?:лей|ля)?\.?)?/gi, " ")
    .replace(/\s+/g, " ")
    .trim();

  const stopWords = new Set([
    "нужна", "нужен", "нужно", "найди", "ищу", "хочу", "мне", "для",
    "ребенку", "ребенку", "лет", "года", "год", "см", "размер",
    "мальчику", "мальчик", "девочке", "девочка", "сыну", "сын", "дочке", "дочь",
  ]);

  const terms = cleaned
    .replace(/[^\p{L}\p{N}\s-]/gu, " ")
    .split(/\s+/)
    .filter((word) => word.length >= 3 && !stopWords.has(word) && !/^\d+$/.test(word))
    .slice(0, 8);

  // Добавляем пол и возраст как поисковые подсказки, если они явно указаны.
  // Это помогает MVP работать без платного LLM.
  if (gender === "мальчик") terms.push("мальчик");
  if (gender === "девочка") terms.push("девочка");
  if (age !== undefined) terms.push(`${age}`);
  if (size !== undefined) terms.push(`${size}`);

  return { terms: [...new Set(terms)], maxPrice, age, size, gender };
}

export async function searchProducts(query: string, limit = 5) {
  const { terms, maxPrice } = parseSearchQuery(query);
  const supabase = getSupabaseAdmin();

  let request = supabase
    .from("products")
    .select("id,title,price,old_price,rating,url,image_url,available")
    .eq("available", true)
    .order("price", { ascending: true })
    .limit(Math.max(limit * 5, 20));

  if (maxPrice !== undefined && Number.isFinite(maxPrice)) {
    request = request.lte("price", maxPrice);
  }

  if (terms.length > 0) {
    // Используем OR по словам: для небольшого MVP это даёт более полезную
    // выдачу, чем требование совпадения всех слов одновременно.
    request = request.or(terms.map((term) => `title.ilike.%${term}%`).join(","));
  }

  const { data, error } = await request;
  if (error) throw error;

  return ((data ?? []) as SearchResult[]).slice(0, limit);
}
