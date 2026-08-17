import { getSupabaseAdmin } from "./supabase-admin";

export type SearchFilters = {
  terms: string[];
  maxPrice?: number;
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
  const maxPriceMatch = query.match(/(?:до|<=|не дороже)\s*(\d[\d\s]*(?:[.,]\d+)?)\s*(?:₽|руб(?:лей|ля)?\.?)?/i);
  const maxPrice = maxPriceMatch
    ? Number(maxPriceMatch[1].replace(/\s/g, "").replace(",", "."))
    : undefined;

  const cleaned = query
    .replace(/(?:до|<=|не дороже)\s*\d[\d\s]*(?:[.,]\d+)?\s*(?:₽|руб(?:лей|ля)?\.?)?/gi, " ")
    .replace(/\s+/g, " ")
    .trim();

  const stopWords = new Set(["нужна", "нужен", "нужно", "найди", "ищу", "хочу", "мне", "для", "ребенку", "ребёнку", "лет", "года", "год", "см", "размер", "мальчику", "девочке"]);
  const terms = cleaned
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]/gu, " ")
    .split(/\s+/)
    .filter((word) => word.length >= 3 && !stopWords.has(word))
    .slice(0, 8);

  return { terms, maxPrice };
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
    request = request.or(terms.map((term) => `title.ilike.%${term}%`).join(","));
  }

  const { data, error } = await request;
  if (error) throw error;

  return ((data ?? []) as SearchResult[]).slice(0, limit);
}
