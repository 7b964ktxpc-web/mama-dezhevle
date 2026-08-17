import { calculateDealScore } from "../lib/deal-score";
import { getSupabaseAdmin } from "../lib/supabase-admin";
import { notifyPriceAlerts } from "../lib/price-alerts";
import { enabledProductSources } from "../lib/sources/registry";

async function main() {
  const supabase = getSupabaseAdmin();
  const sources = enabledProductSources();
  if (sources.length === 0) throw new Error("No product sources are enabled");

  let collected = 0;
  let priceSnapshots = 0;
  let dealsCreated = 0;
  let alertsNotified = 0;

  for (const source of sources) {
    const products = await source.collect();
    for (const product of products) {
      const { data: saved, error: productError } = await supabase.from("products").upsert({
        external_id: product.externalId, source: product.source, url: product.url, title: product.title,
        brand: product.brand ?? null, category: product.category ?? null, age_label: product.ageLabel ?? null,
        image_url: product.imageUrl ?? null, rating: product.rating ?? null, reviews_count: product.reviewsCount ?? null,
        available: product.available, updated_at: new Date().toISOString(),
      }, { onConflict: "source,external_id" }).select("id").single();
      if (productError || !saved) throw productError ?? new Error(`Product was not saved: ${product.externalId}`);

      const { data: latestPrice, error: latestPriceError } = await supabase.from("prices").select("price,old_price")
        .eq("product_id", saved.id).order("collected_at", { ascending: false }).limit(1).maybeSingle();
      if (latestPriceError) throw latestPriceError;

      const currentPrice = Number(product.price);
      const currentOldPrice = product.oldPrice == null ? null : Number(product.oldPrice);
      const previousPrice = latestPrice ? Number(latestPrice.price) : null;
      const priceChanged = !latestPrice || previousPrice !== currentPrice ||
        (latestPrice.old_price == null ? null : Number(latestPrice.old_price)) !== currentOldPrice;

      if (priceChanged) {
        const { error: priceError } = await supabase.from("prices").insert({ product_id: saved.id, price: currentPrice, old_price: currentOldPrice });
        if (priceError) throw priceError;
        priceSnapshots += 1;
        if (previousPrice !== null && currentPrice < previousPrice) {
          alertsNotified += await notifyPriceAlerts(saved.id, currentPrice, product.title, product.url);
        }
      }

      const referencePrice = currentOldPrice ?? currentPrice;
      const deal = calculateDealScore({ currentPrice, referencePrice, rating: product.rating, reviewsCount: product.reviewsCount, available: product.available });
      if (deal.level !== "reject") {
        const { data: latestDeal, error: latestDealError } = await supabase.from("deals")
          .select("current_price,reference_price,discount_percent,deal_score,deal_level,status")
          .eq("product_id", saved.id).order("created_at", { ascending: false }).limit(1).maybeSingle();
        if (latestDealError) throw latestDealError;
        const sameDeal = latestDeal && Number(latestDeal.current_price) === currentPrice && Number(latestDeal.reference_price) === referencePrice &&
          Number(latestDeal.discount_percent) === Number(deal.realDiscountPercent) && Number(latestDeal.deal_score) === Number(deal.score) &&
          latestDeal.deal_level === deal.level && latestDeal.status === "candidate";
        if (!sameDeal) {
          const { error: dealError } = await supabase.from("deals").insert({ product_id: saved.id, current_price: currentPrice, reference_price: referencePrice,
            discount_percent: deal.realDiscountPercent, deal_score: deal.score, deal_level: deal.level, ai_reason: deal.reasons.join("; ") || null, status: "candidate" });
          if (dealError) throw dealError;
          dealsCreated += 1;
        }
      }
      collected += 1;
    }
  }
  console.log(JSON.stringify({ collected, sources: sources.length, priceSnapshots, dealsCreated, alertsNotified }));
}
main().catch((error) => { console.error(error); process.exit(1); });
