import { getSupabaseAdmin } from "../lib/supabase-admin";
import { buildDealPost } from "../lib/post-template";
import { sendTelegramPost } from "../lib/telegram";

const previewOnly = process.env.PREVIEW_ONLY === "true";

async function main() {
  const supabase = getSupabaseAdmin();
  const { data: deals, error } = await supabase
    .from("deals")
    .select("id, product_id, current_price, reference_price, discount_percent, deal_score, deal_level, ai_reason, products(title,url,rating,reviews_count,age_label,source,available)")
    .eq("status", "candidate")
    .gte("deal_score", 80)
    .in("deal_level", ["good_deal", "super_deal"])
    .order("deal_score", { ascending: false })
    .limit(10);

  if (error) throw error;

  let prepared = 0;
  let skippedPublished = 0;

  for (const deal of deals ?? []) {
    const product = Array.isArray(deal.products) ? deal.products[0] : deal.products;
    if (!product) continue;
    if ((product.reviews_count ?? 0) < 10 || product.available === false) continue;

    const { data: existingPost, error: postLookupError } = await supabase
      .from("telegram_posts")
      .select("id")
      .eq("deal_id", deal.id)
      .maybeSingle();

    if (postLookupError) throw postLookupError;
    if (existingPost) {
      skippedPublished += 1;
      continue;
    }

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

    prepared += 1;
    if (previewOnly) {
      console.log(`PREVIEW deal ${deal.id}:`);
      console.log(text);
      continue;
    }

    const telegram = await sendTelegramPost(text);
    const messageId = telegram?.result?.message_id ?? null;
    await supabase.from("telegram_posts").insert({
      deal_id: deal.id,
      telegram_message_id: messageId,
      post_text: text,
    });
    await supabase
      .from("deals")
      .update({ status: "published", published_at: new Date().toISOString() })
      .eq("id", deal.id);
    console.log(`Published deal ${deal.id}`);
  }

  console.log(JSON.stringify({ prepared, skippedPublished, previewOnly }));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
