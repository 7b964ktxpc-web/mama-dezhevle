import { getSupabaseAdmin } from "./supabase-admin";
import { gatewaySearch, type Offer } from "./kettu-gateway";

// Background Scout: sweeps popular kids-product queries across marketplaces,
// records prices into products/prices and files high-scoring offers as
// candidate deals for the admin panel. Runs inside the Telegram bot loop.

const DEFAULT_QUERIES = [
  "конструктор лего",
  "кроссовки детские",
  "зимний комбинезон детский",
  "пижама детская",
  "автокресло",
  "коляска",
  "кроватка детская",
  "рюкзак школьный",
  "самокат детский",
  "игрушки для малышей",
];

const MIN_DEAL_SCORE = 70;
const MAX_OFFERS_PER_QUERY = 5;

async function saveOffer(supabase: ReturnType<typeof getSupabaseAdmin>, query: string, offer: Offer): Promise<"inserted" | "skipped" | "error"> {
  const { data: saved, error: productError } = await supabase.from("products").upsert({
    external_id: `${offer.source}:${offer.sourceProductId}`,
    source: offer.source,
    url: offer.url,
    title: offer.title,
    brand: offer.brand ?? null,
    category: query,
  }).select("id").single();
  if (productError) throw productError;
  if (!saved?.id) return "error";

  const currentPrice = offer.effectivePrice ?? offer.price;
  const referencePrice = Math.max(offer.oldPrice ?? currentPrice, currentPrice);
  const { error: priceError } = await supabase.from("prices").insert({
    product_id: saved.id,
    price: currentPrice,
    old_price: offer.oldPrice ?? null,
  });
  if (priceError) throw priceError;

  const dealScore = offer.dealScore ?? 0;
  const discountPercent = offer.discountPercent ?? Math.round((1 - currentPrice / referencePrice) * 100);
  const level = dealScore >= 85 ? "super_deal" : dealScore >= 70 ? "good_deal" : "interesting";
  const { error: dealError } = await supabase.from("deals").insert({
    product_id: saved.id,
    current_price: currentPrice,
    reference_price: referencePrice,
    discount_percent: discountPercent,
    deal_score: dealScore,
    deal_level: level,
    ai_reason: offer.promo ?? null,
    status: "candidate",
  });
  if (dealError) throw dealError;
  return "inserted";
}

export async function scoutSweepOnce(): Promise<{ inserted: number; queries: number }> {
  const supabase = getSupabaseAdmin();
  const queries = process.env.SCOUT_QUERIES?.trim()
    ? process.env.SCOUT_QUERIES.split(",").map((q) => q.trim()).filter(Boolean)
    : DEFAULT_QUERIES;
  let inserted = 0;
  for (const query of queries) {
    try {
      const result = await gatewaySearch(query, { limit: 8 });
      const best = result.groups
        .map((g) => g.best)
        .filter((o) => o.verified && (o.dealScore ?? 0) >= MIN_DEAL_SCORE)
        .slice(0, MAX_OFFERS_PER_QUERY);
      for (const offer of best) {
        const outcome = await saveOffer(supabase, query, offer);
        if (outcome === "inserted") inserted += 1;
      }
      console.log(JSON.stringify({ event: "scout_query", query, offers: result.offers.length, groups: result.groups.length, deals: best.length }));
    } catch (error) {
      console.error(`scout query "${query}" failed`, error);
    }
  }
  console.log(JSON.stringify({ event: "scout_sweep_done", inserted, queries: queries.length }));
  return { inserted, queries: queries.length };
}

export function scoutIntervalMs(): number {
  return (Number(process.env.SCOUT_INTERVAL_MINUTES) || 60) * 60 * 1000;
}
