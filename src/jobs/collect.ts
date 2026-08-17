import { calculateDealScore } from "../lib/deal-score";
import { getSupabaseAdmin } from "../lib/supabase-admin";
import { getDetmirFixture } from "../lib/sources/detmir-public";

async function main() {
  const supabase = getSupabaseAdmin();
  const products = getDetmirFixture();

  for (const product of products) {
    const { data: saved, error: productError } = await supabase
      .from("products")
      .upsert(
        {
          external_id: product.externalId,
          source: product.source,
          url: product.url,
          title: product.title,
          brand: product.brand ?? null,
          category: product.category ?? null,
          age_label: product.ageLabel ?? null,
          image_url: product.imageUrl ?? null,
          rating: product.rating ?? null,
          reviews_count: product.reviewsCount ?? null,
          available: product.available,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "source,external_id" },
      )
      .select("id")
      .single();

    if (productError || !saved) {
      throw productError ?? new Error(`Product was not saved: ${product.externalId}`);
    }

    const { error: priceError } = await supabase.from("prices").insert({
      product_id: saved.id,
      price: product.price,
      old_price: product.oldPrice ?? null,
    });
    if (priceError) throw priceError;

    const referencePrice = product.oldPrice ?? product.price;
    const deal = calculateDealScore({
      currentPrice: product.price,
      referencePrice,
      rating: product.rating,
      reviewsCount: product.reviewsCount,
      available: product.available,
    });

    if (deal.level !== "reject") {
      const { error: dealError } = await supabase.from("deals").insert({
        product_id: saved.id,
        current_price: product.price,
        reference_price: referencePrice,
        discount_percent: deal.realDiscountPercent,
        deal_score: deal.score,
        deal_level: deal.level,
        ai_reason: deal.reasons.join("; ") || null,
        status: "candidate",
      });
      if (dealError) throw dealError;
    }

    console.log(JSON.stringify({
      source: product.source,
      title: product.title,
      price: product.price,
      oldPrice: product.oldPrice,
      score: deal.score,
      level: deal.level,
    }));
  }

  console.log(`Collected ${products.length} Detmir fixture products.`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
