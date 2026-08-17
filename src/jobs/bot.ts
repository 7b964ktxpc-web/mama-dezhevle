import { randomUUID } from "node:crypto";
import { getSupabaseAdmin } from "../lib/supabase-admin";
import { searchProducts } from "../lib/product-search";
import { searchByPhoto } from "../lib/photo-search";
import { addPriceAlert, removePriceAlert } from "../lib/price-alerts";
import { getTelegramPhotoUrl, getTelegramUpdates, normalizeSearchQuery, parseUnwatchCommand, parseWatchCommand, searchReply, sendTelegramBotMessage, startText } from "../lib/telegram-bot";

function formatResults(results: Awaited<ReturnType<typeof searchProducts>>) {
  if (!results.length) return "🔎 Пока ничего подходящего не нашла. Попробуй изменить запрос или бюджет.";
  return ["🔎 Результаты:", "", ...results.map((item, index) => `${index + 1}. ${item.title}\n🆔 ${item.id}\n💰 ${Math.round(item.price).toLocaleString("ru-RU")} ₽${item.oldPrice && item.oldPrice > item.price ? ` (было ${Math.round(item.oldPrice).toLocaleString("ru-RU")} ₽)` : ""}${item.rating ? ` ⭐ ${item.rating}` : ""}\n👉 ${item.url}`)].join("\n\n");
}

async function acquireBotLock(supabase: ReturnType<typeof getSupabaseAdmin>, token: string) {
  const now = new Date().toISOString();
  const staleBefore = new Date(Date.now() - 10 * 60 * 1000).toISOString();
  const { data: claimed, error } = await supabase.from("telegram_bot_lock")
    .update({ locked_at: now, owner_token: token })
    .or(`owner_token.is.null,locked_at.lt.${staleBefore}`)
    .select("id")
    .maybeSingle();
  if (error) throw error;
  if (claimed) return true;
  const { error: insertError } = await supabase.from("telegram_bot_lock").insert({ id: true, locked_at: now, owner_token: token });
  if (!insertError) return true;
  if (insertError.code !== "23505") throw insertError;
  return false;
}

async function refreshBotLock(supabase: ReturnType<typeof getSupabaseAdmin>, token: string) {
  const { data, error } = await supabase.from("telegram_bot_lock").update({ locked_at: new Date().toISOString() }).eq("owner_token", token).select("id").maybeSingle();
  if (error) throw error;
  return Boolean(data);
}

async function releaseBotLock(supabase: ReturnType<typeof getSupabaseAdmin>, token: string) {
  await supabase.from("telegram_bot_lock").delete().eq("owner_token", token);
}

async function main() {
  const supabase = getSupabaseAdmin();
  const lockToken = randomUUID();
  if (!(await acquireBotLock(supabase, lockToken))) { console.log("Telegram bot is already running; exiting."); return; }

  try {
    const { data: latestUpdate, error: latestUpdateError } = await supabase.from("telegram_bot_updates").select("update_id").order("update_id", { ascending: false }).limit(1).maybeSingle();
    if (latestUpdateError) throw latestUpdateError;
    const updates = await getTelegramUpdates(latestUpdate ? Number(latestUpdate.update_id) + 1 : undefined);

    for (const update of updates) {
      if (!(await refreshBotLock(supabase, lockToken))) { console.error("Telegram bot lock was lost; stopping safely."); break; }
      const message = update.message;
      if (!message?.chat?.id) continue;
      const { error: updateError } = await supabase.from("telegram_bot_updates").insert({ update_id: update.update_id });
      if (updateError?.code === "23505") continue;
      if (updateError) throw updateError;
      const text = normalizeSearchQuery(message.text ?? message.caption ?? "");
      const userId = message.from?.id ?? message.chat.id;
      const watch = parseWatchCommand(text);
      if (watch) {
        const { data: product, error } = await supabase.from("products").select("id,title").eq("id", watch.productId).maybeSingle();
        if (error) throw error;
        if (!product) await sendTelegramBotMessage(message.chat.id, "Не нашла такой товар. Скопируй ID из результата поиска.");
        else { await addPriceAlert({ telegramUserId: userId, chatId: message.chat.id, productId: product.id, targetPrice: watch.targetPrice }); await sendTelegramBotMessage(message.chat.id, `🔔 Буду следить за «${product.title}»${watch.targetPrice ? ` до ${Math.round(watch.targetPrice)} ₽` : " при снижении цены"}.`); }
        continue;
      }
      const unwatch = parseUnwatchCommand(text);
      if (unwatch) { await removePriceAlert(userId, unwatch); await sendTelegramBotMessage(message.chat.id, "🔕 Отслеживание цены отключено."); continue; }
      if (text === "/watches") {
        const { data, error } = await supabase.from("telegram_price_alerts").select("product_id,target_price,products(title)").eq("telegram_user_id", userId).eq("active", true);
        if (error) throw error;
        await sendTelegramBotMessage(message.chat.id, data?.length ? ["🔔 Мои подписки:", "", ...data.map((item) => `• ${item.products?.title ?? item.product_id}${item.target_price ? ` — до ${Math.round(Number(item.target_price))} ₽` : " — любое снижение"}`)].join("\n") : "🔕 Активных подписок нет.");
        continue;
      }
      if (text === "/start" || text.startsWith("/start ")) { await sendTelegramBotMessage(message.chat.id, startText(message.from?.first_name)); continue; }
      if (message.photo?.length) {
        try {
          await sendTelegramBotMessage(message.chat.id, "📸 Смотрю на фото и ищу похожие товары…");
          const largestPhoto = [...message.photo].sort((a, b) => b.width * b.height - a.width * a.height)[0];
          if (!largestPhoto) continue;
          const photoSearch = await searchByPhoto(await getTelegramPhotoUrl(largestPhoto.file_id), 5);
          const detected = photoSearch.analysis.query;
          const { error: requestError } = await supabase.from("search_requests").insert({ telegram_user_id: userId, chat_id: message.chat.id, query_text: `[photo] ${detected}` });
          if (requestError) console.error("Could not save photo search", requestError);
          await sendTelegramBotMessage(message.chat.id, `👀 Похоже, ищем: ${detected}\n\n${formatResults(photoSearch.results)}`);
        } catch (error) { console.error("Photo search failed", error); await sendTelegramBotMessage(message.chat.id, "Не смогла распознать фото. Попробуй отправить более чёткое фото товара или напиши, что именно нужно найти."); }
        continue;
      }
      if (!text) continue;
      const { error } = await supabase.from("search_requests").insert({ telegram_user_id: userId, chat_id: message.chat.id, query_text: text });
      if (error) { console.error("Could not save search request", error); await sendTelegramBotMessage(message.chat.id, "Не удалось сохранить запрос. Попробуй ещё раз чуть позже."); continue; }
      try { await sendTelegramBotMessage(message.chat.id, formatResults(await searchProducts(text, 5))); }
      catch (error) { console.error("Product search failed", error); await sendTelegramBotMessage(message.chat.id, searchReply(text)); }
    }
  } finally { await releaseBotLock(supabase, lockToken); }
}
main().catch((error) => { console.error(error); process.exit(1); });
