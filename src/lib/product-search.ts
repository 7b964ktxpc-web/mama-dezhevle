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
  const maxPrice = maxPriceMatch ? Number(maxPriceMatch[1].replace(/\s/g, "").replace(",", ".")) : undefined;
  const ageMatch = normalized.match(/(?:на\s*)?(\d{1,2})\s*(?:лет|года|год|г\.?)/i);
  const age = ageMatch ? Number(ageMatch[1]) : undefined;
  const sizeMatch = normalized.match(/(?:размер\s*)?(\d{2,3})\s*(?:см)?\b/i);
  const size = sizeMatch ? Number(sizeMatch[1]) : undefined;
  const gender = normalized.includes("мальчик") || normalized.includes("сын") ? "мальчик" : normalized.includes("девоч") || normalized.includes("дочь") ? "девочка" : undefined;
  const cleaned = normalized.replace(/(?:до|<=|не дороже)\s*\d[\d\s]*(?:[.,]\d+)?\s*(?:₽|руб(?:лей|ля)?\.?)?/gi, " ").replace(/\s+/g, " ").trim();
  const stopWords = new Set(["нужна", "нужен", "нужно", "найди", "ищу", "хочу", "мне", "для", "ребенку", "ребенок", "лет", "года", "год", "см", "размер", "мальчику", "мальчик", "девочке", "девочка", "сыну", "сын", "дочке", "дочь"]);
  const terms = cleaned.replace(/[^\p{L}\p{N}\s-]/gu, " ").split(/\s+/).filter((word) => word.length >= 3 && !stopWords.has(word) && !/^\d+$/.test(word)).slice(0, 8);
  return { terms: [...new Set(terms)], maxPrice, age, size, gender };
}

function scoreProduct(title: string, filters: SearchFilters, price: number, rating?: number | null, oldPrice?: number | null) {
  const normalizedTitle = title.toLowerCase().replace(/ё/g, "е");
  let score = 0;
  for (const term of filters.terms) if (normalizedTitle.includes(term)) score += 10;
  if (filters.gender) {
    const genderWords = filters.gender === "мальчик" ? ["мальчик", "мальч", "сын"] : ["девоч", "дочь", "девушка"];
    if (genderWords.some((word) => normalizedTitle.includes(word))) score += 18;
  }
  if (filters.age !== undefined && new RegExp(`(?:^|\\D)${filters.age}(?:\\D|$)`).test(normalizedTitle)) score += 12;
  if (filters.size !== undefined && new RegExp(`(?:^|\\D)${filters.size}(?:\\D|$)`).test(normalizedTitle)) score += 12;
  if (rating) score += Math.min(Number(rating), 5) * 2;
  if (oldPrice && oldPrice > price) score += Math.min(((oldPrice - price) / oldPrice) * 20, 20);
  return score;
}

type ProductRow = {
  id: string;
  title: string;
  url: string;
  image_url: string | null;
  rating: number | null;
  available: boolean;
  prices: Array<{ price: number; old_price: number | null; collected_at: string }>;
};

export async function searchProducts(query: string, limit = 5) {
  const filters = parseSearchQuery(query);
  const supabase = getSupabaseAdmin();
  let request = supabase.from("products").select("id,title,url,image_url,rating,available,prices(price,old_price,collected_at)").eq("available", true).limit(Math.max(limit * 20, 100));
  if (filters.terms.length > 0) request = request.or(filters.terms.map((term) => `title.ilike.%${term}%`).join(","));
  const { data, error } = await request;
  if (error) throw error;

  const candidates = ((data ?? []) as ProductRow[]).map((product) => {
    const latest = [...(product.prices ?? [])].sort((a, b) => new Date(b.collected_at).getTime() - new Date(a.collected_at).getTime())[0];
    if (!latest) return null;
    const price = Number(latest.price);
    if (!Number.isFinite(price) || (filters.maxPrice !== undefined && price > filters.maxPrice)) return null;
    return {
      item: { id: product.id, title: product.title, price, oldPrice: latest.old_price === null ? null : Number(latest.old_price), rating: product.rating === null ? null : Number(product.rating), url: product.url, imageUrl: product.image_url },
      score: scoreProduct(product.title, filters, price, product.rating, latest.old_price),
    };
  }).filter((value): value is NonNullable<typeof value> => value !== null);

  return candidates.sort((a, b) => b.score - a.score || a.item.price - b.item.price).slice(0, limit).map(({ item }) => item);
}
