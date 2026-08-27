import { randomUUID } from "node:crypto";
import { getSupabaseAdmin } from "../lib/supabase-admin";
import { searchByPhoto } from "../lib/photo-search";
import { searchWebProducts } from "../lib/web-parser-search";
import { handleConversation } from "../lib/conversation-agent";
import { addPriceAlert, removePriceAlert } from "../lib/price-alerts";
import { trackedUrlFor } from "../lib/affiliate";
import { answerTelegramCallback, deleteTelegramWebhook, getTelegramPhotoUrl, getTelegramUpdates, mainMenuKeyboard, normalizeSearchQuery, parseUnwatchCommand, parseWatchCommand, resultKeyboard, sendTelegramBotMessage, startText, supportKeyboard } from "../lib/telegram-bot";

function formatResult(item: any, index: number) { return `${index + 1}. ${item.title}\n💰 ${Math.round(Number(item.price)).toLocaleString("ru-RU")} ₽${item.oldPrice && item.oldPrice > item.price ? ` (было ${Math.round(Number(item.oldPrice)).toLocaleString("ru-RU")} ₽)` : ""}${item.rating ? ` ⭐ ${item.rating}` : ""}${item.source ? `\n🏪 ${item.source}` : ""}`; }
async function sendResults(chatId: number, results: any[]) { if (!results.length) return sendTelegramBotMessage(chatId, "🔎 Пока ничего подходящего не нашла. Попробуй изменить запрос или бюджет.", supportKeyboard()); for (const [index, item] of results.slice(0, 8).entries()) await sendTelegramBotMessage(chatId, formatResult(item, index), resultKeyboard(item)); }
function latestPriceOf(item: any) { const prices = Array.isArray(item?.prices) ? item.prices : []; const sorted = [...prices].sort((a: any, b: any) => new Date(b.collected_at).getTime() - new Date(a.collected_at).getTime()); return sorted[0] ?? null; }
async function sendWatchesList(supabase: ReturnType<typeof getSupabaseAdmin>, chatId: number, userId: number | string) {
  const { data: alerts, error } = await supabase
    .from("telegram_price_alerts")
    .select("id, product_id, target_price, products(title, url, source, prices(price, old_price, collected_at))")
    .eq("telegram_user_id", userId).eq("active", true);
  if (error) throw error;
  if (!alerts?.length) { await sendTelegramBotMessage(chatId, "🔔 У тебя пока нет отслеживаемых товаров. Найди товар и нажми «🔔 Следить», чтобы я писала, когда подешевеет.", mainMenuKeyboard()); return; }

  for (const alert of alerts) {
    const product = Array.isArray(alert.products) ? alert.products[0] : alert.products;
    const price = latestPriceOf(product);
    const current = price ? Math.round(Number(price.price)).toLocaleString("ru-RU") : "—";
    const target = alert.target_price != null ? ` до ${Math.round(Number(alert.target_price)).toLocaleString("ru-RU")} ₽` : "";
    const link = product?.url ? trackedUrlFor(alert.product_id, product.source, product.url) : null;
    const text = `🔔 ${product?.title ?? "Товар"}\n💰 Сейчас: ${current} ₽${target}${product?.source ? `\n🏪 ${product.source}` : ""}`;
    const row: Array<Record<string, string>> = [];
    if (link) row.push({ text: "🛒 Открыть", url: link });
    row.push({ text: "🔕 Отписаться", callback_data: `unwatch:${alert.product_id}` });
    await sendTelegramBotMessage(chatId, text, { inline_keyboard: [row] });
  }
}
async function acquireBotLock(supabase: ReturnType<typeof getSupabaseAdmin>, token: string) { const { data, error } = await supabase.rpc("acquire_telegram_bot_lock", { p_owner_token: token, p_stale_minutes: 10 }); if (error) throw error; return Boolean(data); }
async function refreshBotLock(supabase: ReturnType<typeof getSupabaseAdmin>, token: string) { const { data, error } = await supabase.rpc("refresh_telegram_bot_lock", { p_owner_token: token }); if (error) throw error; return Boolean(data); }
async function releaseBotLock(supabase: ReturnType<typeof getSupabaseAdmin>, token: string) { const { error } = await supabase.rpc("release_telegram_bot_lock", { p_owner_token: token }); if (error) console.error("Could not release Telegram bot lock", error); }

async function main() {
  const supabase = getSupabaseAdmin(); const lockToken = randomUUID(); if (!(await acquireBotLock(supabase, lockToken))) { console.log("Telegram bot is already running; exiting."); return; }
  try {
    await deleteTelegramWebhook();
    const { data: latestUpdate, error: latestUpdateError } = await supabase.from("telegram_bot_updates").select("update_id").order("update_id", { ascending: false }).limit(1).maybeSingle(); if (latestUpdateError) throw latestUpdateError;
    const updates = await getTelegramUpdates(latestUpdate ? Number(latestUpdate.update_id) + 1 : undefined);
    for (const update of updates) {
      if (!(await refreshBotLock(supabase, lockToken))) break;
      const callback = update.callback_query; if (callback) { await answerTelegramCallback(callback.id); const chatId = callback.message?.chat.id; if (!chatId) continue; const cbUserId = callback.from?.id ?? chatId; if (callback.data === "menu:search") await sendTelegramBotMessage(chatId, "🔎 Просто напиши, что ищем — я продолжу разговор сама.", mainMenuKeyboard()); else if (callback.data === "menu:photo") await sendTelegramBotMessage(chatId, "📸 Пришли фотографию товара — попробую определить его и продолжу поиск.", mainMenuKeyboard()); else if (callback.data === "menu:watches") await sendWatchesList(supabase, chatId, cbUserId); else if (callback.data === "menu:support" || callback.data === "support:start") await sendTelegramBotMessage(chatId, "💬 Я здесь 🙂 Просто напиши мне сообщение обычным текстом.", mainMenuKeyboard()); else if (callback.data?.startsWith("unwatch:")) { await removePriceAlert(Number(cbUserId), callback.data.slice(8)); await sendWatchesList(supabase, chatId, cbUserId); } else if (callback.data?.startsWith("watch:")) { const productId = callback.data.slice(6); try { await addPriceAlert({ telegramUserId: Number(cbUserId), chatId, productId }); await sendTelegramBotMessage(chatId, "🔔 Буду следить за этим товаром и напишу, когда подешевеет. Чтобы задать желаемую цену, отправь: /watch <id> <цена>.", mainMenuKeyboard()); } catch { await sendTelegramBotMessage(chatId, "Не смогла оформить подписку на этот товар.", mainMenuKeyboard()); } } continue; }
      const message = update.message; if (!message?.chat?.id) continue; const { error: updateError } = await supabase.from("telegram_bot_updates").insert({ update_id: update.update_id }); if (updateError?.code === "23505") continue; if (updateError) throw updateError;
      const text = normalizeSearchQuery(message.text ?? message.caption ?? ""); const userId = message.from?.id ?? message.chat.id;
      if (text === "/start" || text.startsWith("/start ") || text === "/help") { await sendTelegramBotMessage(message.chat.id, startText(message.from?.first_name), mainMenuKeyboard()); continue; }
      const watch = parseWatchCommand(text); if (watch) { const { data: product, error } = await supabase.from("products").select("id,title").eq("id", watch.productId).maybeSingle(); if (error) throw error; if (!product) await sendTelegramBotMessage(message.chat.id, "Не нашла такой товар."); else { await addPriceAlert({ telegramUserId: userId, chatId: message.chat.id, productId: product.id, targetPrice: watch.targetPrice }); await sendTelegramBotMessage(message.chat.id, `🔔 Буду следить за «${product.title}»${watch.targetPrice ? ` до ${Math.round(watch.targetPrice)} ₽` : " при снижении цены"}.`, mainMenuKeyboard()); } continue; }
      const unwatch = parseUnwatchCommand(text); if (unwatch) { await removePriceAlert(userId, unwatch); await sendTelegramBotMessage(message.chat.id, "🔕 Отслеживание цены отключено.", mainMenuKeyboard()); continue; }
      if (text === "/watches") { await sendWatchesList(supabase, message.chat.id, userId); continue; }
      if (message.photo?.length) { try { await sendTelegramBotMessage(message.chat.id, "📸 Смотрю на фото…"); const largestPhoto = [...message.photo].sort((a, b) => b.width * b.height - a.width * a.height)[0]; if (!largestPhoto) continue; const photoSearch = await searchByPhoto(await getTelegramPhotoUrl(largestPhoto.file_id), 5); const detected = photoSearch.analysis.query; const webResults = await searchWebProducts(detected, 5); await sendTelegramBotMessage(message.chat.id, `👀 Похоже, ищем: ${detected}`); await sendResults(message.chat.id, [...photoSearch.results, ...webResults]); } catch (error) { console.error("Photo search failed", error); await sendTelegramBotMessage(message.chat.id, "Не смогла распознать фото. Попробуй более чёткое фото или опиши товар словами.", mainMenuKeyboard()); } continue; }
      if (!text) continue;
      const result = await handleConversation(userId, text);
      if (result.results) await sendResults(message.chat.id, result.results); else await sendTelegramBotMessage(message.chat.id, result.text, mainMenuKeyboard());
    }
  } finally { await releaseBotLock(supabase, lockToken); }
}
main().catch((error) => { console.error(error); process.exit(1); });
