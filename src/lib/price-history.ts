import type { SupabaseClient } from "@supabase/supabase-js";

export type PriceHistory = {
  average30d: number | null;
  min30d: number | null;
};

export async function getPriceHistory(
  supabase: SupabaseClient,
  productId: string,
): Promise<PriceHistory> {
  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const { data, error } = await supabase
    .from("prices")
    .select("price")
    .eq("product_id", productId)
    .gte("collected_at", since)
    .order("collected_at", { ascending: false })
    .limit(500);

  if (error) throw error;
  const prices = (data ?? [])
    .map((row) => Number(row.price))
    .filter((price) => Number.isFinite(price) && price > 0);

  if (prices.length === 0) return { average30d: null, min30d: null };

  const average30d = prices.reduce((sum, price) => sum + price, 0) / prices.length;
  return {
    average30d: Math.round(average30d * 100) / 100,
    min30d: Math.min(...prices),
  };
}
