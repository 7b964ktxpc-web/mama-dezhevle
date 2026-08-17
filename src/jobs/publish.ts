import { getSupabaseAdmin } from "../lib/supabase-admin";
import { buildDealPost } from "../lib/post-template";
import { sendTelegramPost } from "../lib/telegram";

const previewOnly = process.env.PREVIEW_ONLY === "true";

async function main() {
  const supabase = getSupabaseAdmin();
  const { data: deals, error } = await supabase.from("deals")
    .select("id, product_id, current_price, reference_price, discount_percent, deal_score, deal_level, ai_reason, products(title,url,rating,reviews_count,age_label,source,available)")
    .eq("status", "candidate").gte("deal_score", 80).in("deal_level", ["good_deal", "super_deal"])
    .order("deal_score", { ascending: false }).limit(10);
  if (error) throw error;

  let prepared = 0, skippedPublished = 0, skippedNotImproved = 0;
  for (const deal of deals ?? []) {
    const product = Array.isArray(deal.products) ? deal.products[0] : deal.products;
    if (!product || product.available === false || (product.reviews_count ?? 0) < 10) continue;

    const { data: previousPosts, error: postError } = await supabase.from("telegram_posts")
      .select("id,deal_id,post_text,created_at").eq("deal_id", deal.id).order("created_at", { ascending: false }).limit(1);
    if (postError) throw postError;
    if (previousPosts?.length) { skippedPublished += 1; continue; }

    const { data: productPosts, error: productPostsError } = await supabase.from("telegram_posts")
      .select("id,deal_id,post_text,created_at,deals!inner(product_id,current_price,deal_score)")
      .eq("deals.product_id", deal.product_id).order("created_at", { ascending: false }).limit(5);
    if (productPostsError) throw productPostsError;
    const lastPublishedPrice = productPosts?.map((x: any) => Number(x.deals?.current_price)).filter((x: number) => x > 0).sort((a: number,b: number) => a-b)[0];
    if (lastPublishedPrice && Number(deal.current_price) >= lastPublishedPrice) { skippedNotImproved += 1; continue; }

    const text = buildDealPost({ title: product.title, currentPrice: Number(deal.current_price), referencePrice: Number(deal.reference_price), rating: product.rating, reviewsCount: product.reviews_count, ageLabel: product.age_label, url: product.url, source: product.source }, { score: deal.deal_score, level: deal.deal_level, realDiscountPercent: Number(deal.discount_percent), savingAmount: Math.max(0, Number(deal.reference_price)-Number(deal.current_price)), reasons: deal.ai_reason ? [deal.ai_reason] : [] });
    prepared += 1;
    if (previewOnly) { console.log(`PREVIEW deal ${deal.id}:`); console.log(text); continue; }
    const telegram = await sendTelegramPost(text);
    const messageId = telegram?.result?.message_id ?? null;
    await supabase.from("telegram_posts").insert({ deal_id: deal.id, telegram_message_id: messageId, post_text: text });
    await supabase.from("deals").update({ status: "published", published_at: new Date().toISOString() }).eq("id", deal.id);
    console.log(`Published deal ${deal.id}`);
  }
  console.log(JSON.stringify({ prepared, skippedPublished, skippedNotImproved, previewOnly }));
}
main().catch((error) => { console.error(error); process.exit(1); });
