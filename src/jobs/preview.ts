import { getSupabaseAdmin } from "../lib/supabase-admin";
import { buildDealPost } from "../lib/post-template";

function validatePreview(row: {
  currentPrice: number;
  referencePrice: number;
  discount: number;
  url: string;
  reviewsCount?: number | null;
  text: string;
}) {
  const errors: string[] = [];
  if (!row.url.startsWith("http://") && !row.url.startsWith("https://")) errors.push("invalid_url");
  if (!(row.currentPrice > 0)) errors.push("invalid_current_price");
  if (!(row.referencePrice > row.currentPrice)) errors.push("reference_not_above_current");
  if (!(row.discount >= 20 && row.discount <= 99.9)) errors.push("discount_out_of_range");
  if ((row.reviewsCount ?? 0) < 10) errors.push("not_enough_reviews");
  if (row.text.length < 80) errors.push("post_too_short");
  return errors;
}

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
    if (!product || product.available === false) return [];
    const currentPrice = Number(deal.current_price);
    const referencePrice = Number(deal.reference_price);
    const discount = Number(deal.discount_percent);
    const text = buildDealPost(
      {
        title: product.title,
        currentPrice,
        referencePrice,
        rating: product.rating,
        reviewsCount: product.reviews_count,
        ageLabel: product.age_label,
        url: product.url,
        source: product.source,
      },
      {
        score: deal.deal_score,
        level: deal.deal_level,
        realDiscountPercent: discount,
        savingAmount: Math.max(0, referencePrice - currentPrice),
        reasons: deal.ai_reason ? [deal.ai_reason] : [],
      },
    );
    const validationErrors = validatePreview({
      currentPrice,
      referencePrice,
      discount,
      url: product.url,
      reviewsCount: product.reviews_count,
      text,
    });
    return [{ id: deal.id, score: deal.deal_score, discount, title: product.title, url: product.url, validationErrors, valid: validationErrors.length === 0, text }];
  });

  const valid = rows.filter((row) => row.valid);
  const invalid = rows.filter((row) => !row.valid);
  console.log(JSON.stringify({ count: valid.length, invalidCount: invalid.length, deals: valid, invalid }, null, 2));
  if (invalid.length > 0) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
