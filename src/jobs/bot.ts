import { randomUUID } from "node:crypto";
import { getSupabaseAdmin } from "../lib/supabase-admin";
import { searchProducts } from "../lib/product-search";
import { searchByPhoto } from "../lib/photo-search";
import { searchWebProducts } from "../lib/web-parser-search";
import { addPriceAlert, removePriceAlert } from "../lib/price-alerts";
import { answerTelegramCallback, getTelegramPhotoUrl, getTelegramUpdates, mainMenuKeyboard, normalizeSearchQuery, parseUnwatchCommand, parseWatchCommand, resultKeyboard, searchReply, sendTelegramBotMessage, startText, supportKeyboard } from "../lib/telegram-bot";

function formatResult(item: any, index: number) {
  return `${index + 1}. ${item.title}\n💰 ${Math.round(Number(item.price)).toLocaleString("ru-RU")} ₽${item.oldPrice && item.oldPrice > item.price ? ` (было ${Math.round(Number(item.oldPrice)).toLocaleString("ru-RU")} ₽)` : ""}${item.rating ? ` ⭐ ${item.rating}` : ""}${item.source ? `\n🏪 ${item.source}` : ""}`;
}

async function sendResults(chatId: number, results: any[]) {
  if (!results.length) return sendTelegramBotMessage(chatId, "🔎 Пока ничего подходящего не нашла. Попробуй изменить запрос или бюджет.", supportKeyboard());
  for (const [index, item] of results.slice(0, 8).entries()) {
    await sendTelegramBotMessage(chatId, formatResult(item, index), resultKeyboard(item));
  }
}

async function acquireBotLock(supabase: ReturnType<typeof getSupabaseAdmin>, token: string) { const { data, error } = await supabase.rpc("acquire_telegram_bot_lock", { p_owner_token: token, p_stale_minutes: 10 }); if (error) throw error; return Boolean(data); }
async function refreshBotLock(supabase: ReturnType<typeof getSupabaseAdmin>, token: string) { const { data, error } = await supabase.rpc("refresh_telegram_bot_lock", { p_owner_token: token }); if (error) throw error; return Boolean(data); }
async function releaseBotLock(supabase: ReturnType<typeof getSupabaseAdmin>, token: string) { const { error } = await supabase.rpc("release_telegram_bot_lock", { p_owner_token: token }); if (error) console.error("Could not release Telegram bot lock", error); }

async function main() {
  const supabase = getSupabaseAdmin(); const lockToken = randomUUID();
  if (!(await acquireBotLock(supabase, lockToken))) { console.log("Telegram bot is already running; exiting."); return; }
  try {
    const { data: latestUpdate, error: latestUpdateError } = await supabase.from("telegram_bot_updates").select("update_id").order("update_id", { ascending: false }).limit(1).maybeSingle();
    if (latestUpdateError) throw latestUpdateError;
    const updates = await getTelegramUpdates(latestUpdate ? Number(latestUpdate.update_id) + 1 : undefined);
    for (const update of updates) {
      if (!(await refreshBotLock(supabase, lockToken))) { console.error("Telegram bot lock was lost; stopping safely."); break; }
      const callback = update.callback_query;
      if (callback) {
        await answerTelegramCallback(callback.id);
        const chatId = callback.message?.chat.id;
        if (!chatId) continue;
        if (callback.data === "menu:search") await sendTelegramBotMessage(chatId, "🔎 Напиши, что ищем — например: «кроссовки мальчику 5 лет, 30 размер до 3000 ₽».", mainMenuKeyboard());
        else if (callback.data === "menu:photo") await sendTelegramBotMessage(chatId, "📸 Пришли фотографию товара — попробую определить его и найти похожие варианты дешевле.", mainMenuKeyboard());
        else if (callback.data === "menu:watches") await sendTelegramBotMessage(chatId, "🔔 Чтобы посмотреть подписки, используй /watches.", mainMenuKeyboard());
        else if (callback.data === "menu:support" || callback.data === "support:start") await sendTelegramBotMessage(chatId, "💬 Живое общение включено. Напиши сообщение — передам его оператору.", supportKeyboard());
        else if (callback.data?.startsWith("watch:")) await sendTelegramBotMessage(chatId, `🔔 Отправь команду /watch ${callback.data.slice(6)}, чтобы включить отслеживание цены.`, supportKeyboard());
        continue;
      }
      const message = update.message; if (!message?.chat?.id) continue;
      const { error: updateError } = await supabase.from("telegram_bot_updates").insert({ update_id: update.update_id });
      if (updateError?.code === "23505") continue; if (updateError) throw updateError;
      const text = normalizeSearchQuery(message.text ?? message.caption ?? ""); const userId = message.from?.id ?? message.chat.id;
      if (text === "/start" || text.startsWith("/start ")) { await sendTelegramBotMessage(message.chat.id, startText(message.from?.first_name), mainMenuKeyboard()); continue; }
      if (text === "/help") { await sendTelegramBotMessage(message.chat.id, startText(message.from?.first_name), mainMenuKeyboard()); continue; }
      if (text === "/live") { await sendTelegramBotMessage(message.chat.id, "💬 Напиши вопрос одним сообщением — оператор увидит его и сможет ответить.", supportKeyboard()); continue; }
      const adminChatId = process.env.TELEGRAM_ADMIN_CHAT_ID;
      if (adminChatId && message.chat.id.toString() !== adminChatId && text.startsWith("/operator")) { await sendTelegramBotMessage(message.chat.id, "💬 Напиши сообщение после команды /live, и я передам его оператору.", supportKeyboard()); continue; }
      if (adminChatId && message.chat.id.toString() === adminChatId && text.startsWith("/reply ")) {
        const match = text.match(/^\/reply\s+(-?\d+)\s+([\s\S]+)/i); if (match) await sendTelegramBotMessage(match[1], `💬 Ответ оператора:\n\n${match[2]}`); continue;
      }
      if (adminChatId && message.chat.id.toString() !== adminChatId && text && (text.startsWith("/live ") || text.startsWith("@operator "))) {
        const body = text.replace(/^\/(?:live)\s+|^@operator\s+/i, "");
        await sendTelegramBotMessage(Number(adminChatId), `💬 Сообщение от пользователя ${message.from?.first_name ?? ""} (@${message.from?.username ?? "без username"}, chat ${message.chat.id}):\n\n${body}`);
        await sendTelegramBotMessage(message.chat.id, "✅ Передала оператору. Жди ответа здесь.", supportKeyboard()); continue;
      }
      const watch = parseWatchCommand(text);
      if (watch) { const { data: product, error } = await supabase.from("products").select("id,title").eq("id", watch.productId).maybeSingle(); if (error) throw error; if (!product) await sendTelegramBotMessage(message.chat.id, "Не нашла такой товар. Скопируй ID из результата поиска."); else { await addPriceAlert({ telegramUserId: userId, chatId: message.chat.id, productId: product.id, targetPrice: watch.targetPrice }); await sendTelegramBotMessage(message.chat.id, `🔔 Буду следить за «${product.title}»${watch.targetPrice ? ` до ${Math.round(watch.targetPrice)} ₽` : " при снижении цены"}.`, mainMenuKeyboard()); } continue; }
      const unwatch = parseUnwatchCommand(text); if (unwatch) { await removePriceAlert(userId, unwatch); await sendTelegramBotMessage(message.chat.id, "🔕 Отслеживание цены отключено.", mainMenuKeyboard()); continue; }
      if (text === "/watches") { const { data, error } = await supabase.from("telegram_price_alerts").select("product_id,target_price,products(title)").eq("telegram_user_id", userId).eq("active", true); if (error) throw error; const watches = (data ?? []) as Array<{ product_id: string; target_price: number | null; products: Array<{ title: string }> | null }>; await sendTelegramBotMessage(message.chat.id, watches.length ? ["🔔 Мои подписки:", "", ...watches.map((item) => `• ${item.products?.[0]?.title ?? item.product_id}${item.target_price ? ` — до ${Math.round(Number(item.target_price))} ₽` : " — любое снижение"}`)].join("\n") : "🔕 Активных подписок нет.", mainMenuKeyboard()); continue; }
      if (message.photo?.length) { try { await sendTelegramBotMessage(message.chat.id, "📸 Смотрю на фото и ищу похожие товары…"); const largestPhoto = [...message.photo].sort((a, b) => b.width * b.height - a.width * a.height)[0]; if (!largestPhoto) continue; const photoSearch = await searchByPhoto(await getTelegramPhotoUrl(largestPhoto.file_id), 5); const detected = photoSearch.analysis.query; const webResults = await searchWebProducts(detected, 5); const combined = [...photoSearch.results, ...webResults]; await sendTelegramBotMessage(message.chat.id, `👀 Похоже, ищем: ${detected}`); await sendResults(message.chat.id, combined); } catch (error) { console.error("Photo search failed", error); await sendTelegramBotMessage(message.chat.id, "Не смогла распознать фото. Попробуй отправить более чёткое фото товара или напиши, что именно нужно найти.", supportKeyboard()); } continue; }
      if (!text) continue;
      const { error } = await supabase.from("search_requests").insert({ telegram_user_id: userId, chat_id: message.chat.id, query_text: text }); if (error) console.error("Could not save search request", error);
      try { const [catalog, web] = await Promise.all([searchProducts(text, 5), searchWebProducts(text, 5)]); await sendResults(message.chat.id, [...catalog, ...web]); }
      catch (error) { console.error("Product search failed", error); await sendTelegramBotMessage(message.chat.id, searchReply(text), supportKeyboard()); }
    }
  } finally { await releaseBotLock(supabase, lockToken); }
}
main().catch((error) => { console.error(error); process.exit(1); });
