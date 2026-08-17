import { getSupabaseAdmin } from "./supabase-admin";
import { sendTelegramBotMessage } from "./telegram-bot";

export async function addPriceAlert(input: { telegramUserId: number; chatId: number; productId: string; targetPrice?: number | null }) {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase.from("telegram_price_alerts").upsert({
    telegram_user_id: input.telegramUserId, chat_id: input.chatId, product_id: input.productId,
    target_price: input.targetPrice ?? null, active: true, notified_price: null,
  }, { onConflict: "telegram_user_id,product_id" }).select("id,product_id,target_price,active").single();
  if (error) throw error;
  return data;
}

export async function removePriceAlert(telegramUserId: number, productId: string) {
  const supabase = getSupabaseAdmin();
  const { error } = await supabase.from("telegram_price_alerts").update({ active: false })
    .eq("telegram_user_id", telegramUserId).eq("product_id", productId);
  if (error) throw error;
}

export async function notifyPriceAlerts(productId: string, currentPrice: number, title: string, url: string) {
  const supabase = getSupabaseAdmin();
  const { data: alerts, error } = await supabase.from("telegram_price_alerts")
    .select("id,chat_id,target_price,notified_price").eq("product_id", productId).eq("active", true);
  if (error) throw error;

  let notified = 0;
  for (const alert of alerts ?? []) {
    const target = alert.target_price == null ? null : Number(alert.target_price);
    const notifiedPrice = alert.notified_price == null ? null : Number(alert.notified_price);
    const reachedTarget = target !== null && currentPrice <= target;
    const priceDropped = notifiedPrice !== null && currentPrice < notifiedPrice;
    if (!reachedTarget && !priceDropped) continue;
    if (notifiedPrice !== null && currentPrice >= notifiedPrice) continue;

    try {
      await sendTelegramBotMessage(alert.chat_id, `📉 Цена снизилась!\n\n${title}\n💰 Сейчас: ${Math.round(currentPrice).toLocaleString("ru-RU")} ₽\n👉 ${url}`);
    } catch (telegramError) {
      console.error(`Price alert Telegram delivery failed for alert ${alert.id}`, telegramError);
      continue;
    }

    const { error: updateError } = await supabase.from("telegram_price_alerts")
      .update({ notified_price: currentPrice }).eq("id", alert.id);
    if (updateError) throw updateError;
    notified += 1;
  }
  return notified;
}
