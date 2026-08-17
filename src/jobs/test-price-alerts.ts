import { addPriceAlert, notifyPriceAlerts, removePriceAlert } from "../lib/price-alerts";
import { getSupabaseAdmin } from "../lib/supabase-admin";

async function main() {
  const supabase = getSupabaseAdmin();
  const { data: product, error } = await supabase.from("products").select("id,title,url").limit(1).maybeSingle();
  if (error) throw error;
  if (!product) {
    console.log(JSON.stringify({ skipped: true, reason: "No product available for price-alert test" }));
    return;
  }

  if (!process.env.TEST_TELEGRAM_CHAT_ID) {
    console.log(JSON.stringify({ skipped: true, reason: "TEST_TELEGRAM_CHAT_ID is not configured" }));
    return;
  }

  const telegramUserId = Number(process.env.TEST_TELEGRAM_USER_ID || "999999999");
  const chatId = Number(process.env.TEST_TELEGRAM_CHAT_ID);
  if (!Number.isSafeInteger(telegramUserId) || !Number.isSafeInteger(chatId)) throw new Error("Invalid test Telegram identifiers");

  await addPriceAlert({ telegramUserId, chatId, productId: product.id, targetPrice: null });
  const result = await notifyPriceAlerts(product.id, 1, product.title, product.url);
  await removePriceAlert(telegramUserId, product.id);
  await supabase.from("telegram_price_alerts").delete().eq("telegram_user_id", telegramUserId).eq("product_id", product.id);
  console.log(JSON.stringify({ productId: product.id, notifications: result, cleaned: true }));
}

main().catch((error) => { console.error(error); process.exit(1); });
