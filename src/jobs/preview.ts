import { getSupabaseAdmin } from "../lib/supabase-admin";
import { buildDealPost } from "../lib/post-template";

async function main() {
  const supabase = getSupabaseAdmin();
  const { data: deals, error } = await supabase
    .from("deals")
    .select("id, current_price, reference_price, discount_percent, deal_score, deal_level, ai_reason, products(title,url,rating,reviews_count,age_label,source,available)")
    .eq("status", "candidate")
    .gte("deal_score", 80)
    .order("deal_score", { ascending: false })
    .limit(10);

  if (error) throw error;

  const rows = (deals ?? []).flatMap((deal) => {
    const product = Array.isArray(deal.products) ? deal.products[0] : deal.products;
    if (!product || product.available === false || (product.reviews_count ?? 0) < 10) return [];
    const text = buildDealPost(
      {
        title: product.title,
        currentPrice: Number(deal.current_price),
        referencePrice: Number(deal.reference_price),
        rating: product.rating,
        reviewsCount: product.reviews_count,
        ageLabel: product.age_label,
        url: product.url,
        source: product.source,
      },
      {
        score: deal.deal_score,
        level: deal.deal_level,
        realDiscountPercent: Number(deal.discount_percent),
        savingAmount: Math.max(0, Number(deal.reference_price) - Number(deal.current_price)),
        reasons: deal.ai_reason ? [deal.ai_reason] : [],
      },
    );
    return [{ id: deal.id, score: deal.deal_score, discount: Number(deal.discount_percent), title: product.title, url: product.url, text }];
  });

  console.log(JSON.stringify({ count: rows.length, deals: rows }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
