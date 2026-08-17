import { getSupabaseAdmin } from "../lib/supabase-admin";
import { buildDealPost } from "../lib/post-template";

const MIN_SCORE = 70;
const MIN_REVIEWS = 10;
const MIN_DISCOUNT = 20;
const MAX_DISCOUNT = 99.9;

function validatePreview(row: { currentPrice: number; referencePrice: number; discount: number; url: string; reviewsCount?: number | null; score: number; text: string }) {
  const errors: string[] = [];
  if (!/^https?:\/\//i.test(row.url)) errors.push("invalid_url");
  if (!(row.currentPrice > 0)) errors.push("invalid_current_price");
  if (!(row.referencePrice > row.currentPrice)) errors.push("reference_not_above_current");
  if (!(row.discount >= MIN_DISCOUNT && row.discount <= MAX_DISCOUNT)) errors.push("discount_out_of_range");
  if (row.score < MIN_SCORE) errors.push("score_below_threshold");
  if ((row.reviewsCount ?? 0) < MIN_REVIEWS) errors.push("not_enough_reviews");
  if (row.text.trim().length < 80) errors.push("post_too_short");
  return errors;
}

async function main() {
  const supabase = getSupabaseAdmin();
  const { data: deals, error } = await supabase.from("deals")
    .select("id,current_price,reference_price,discount_percent,deal_score,deal_level,ai_reason,products(title,url,rating,reviews_count,age_label,source,available)")
    .eq("status", "candidate").gte("deal_score", MIN_SCORE)
    .order("deal_score", { ascending: false }).limit(10);
  if (error) throw error;

  const rows = (deals ?? []).flatMap((deal: any) => {
    const p = Array.isArray(deal.products) ? deal.products[0] : deal.products;
    if (!p || p.available === false) return [];
    const currentPrice = Number(deal.current_price), referencePrice = Number(deal.reference_price), discount = Number(deal.discount_percent), score = Number(deal.deal_score);
    const text = buildDealPost({ title: p.title, currentPrice, referencePrice, rating: p.rating, reviewsCount: p.reviews_count, ageLabel: p.age_label, url: p.url, source: p.source }, { score, level: deal.deal_level, realDiscountPercent: discount, savingAmount: Math.max(0, referencePrice-currentPrice), reasons: deal.ai_reason ? [deal.ai_reason] : [] });
    const validationErrors = validatePreview({ currentPrice, referencePrice, discount, url: p.url, reviewsCount: p.reviews_count, score, text });
    return [{ id: deal.id, score, discount, title: p.title, url: p.url, validationErrors, valid: validationErrors.length === 0, text }];
  });
  const valid = rows.filter((r) => r.valid).slice(0, 3), invalid = rows.filter((r) => !r.valid);
  console.log(JSON.stringify({ generatedAt: new Date().toISOString(), candidates: rows.length, publishable: valid.length, rejected: invalid.length, deals: valid, invalid }, null, 2));
  if (invalid.length > 0 && valid.length === 0) process.exitCode = 1;
}
main().catch((error) => { console.error(error); process.exit(1); });
