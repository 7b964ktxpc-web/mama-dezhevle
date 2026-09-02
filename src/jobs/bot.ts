import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { randomUUID } from "node:crypto";

function loadDotEnv() {
  const file = join(process.cwd(), ".env");
  if (!existsSync(file)) return;
  for (const line of readFileSync(file, "utf8").split("\n")) {
    const m = line.match(/^\s*([\w.-]+)\s*=\s*(.*)\s*$/);
    if (!m) continue;
    const key = m[1];
    const val = m[2].replace(/^["']|["']$/g, "");
    if (process.env[key] === undefined) process.env[key] = val;
  }
}
loadDotEnv();
import { getSupabaseAdmin } from "../lib/supabase-admin";
import { searchByPhoto } from "../lib/photo-search";
import { searchWebProducts } from "../lib/web-parser-search";
import { handleConversation } from "../lib/conversation-agent";
import { addPriceAlert, removePriceAlert } from "../lib/price-alerts";
import { trackedUrlFor } from "../lib/affiliate";
import { adminTelegramIds } from "../lib/auth";
import { sendTelegramPost } from "../lib/telegram";
import { getChannelId, setChannelId } from "../lib/channel-settings";
import { scoutSweepOnce, scoutIntervalMs } from "../lib/scout-worker";
import { answerTelegramCallback, deleteTelegramWebhook, editTelegramMessage, getTelegramPhotoUrl, getTelegramUpdates, mainMenuKeyboard, adminWebAppKeyboard, adminReplyKeyboard, setTelegramMenuButton, normalizeSearchQuery, parseUnwatchCommand, parseWatchCommand, resultKeyboard, sendTelegramBotMessage, startText, supportKeyboard } from "../lib/telegram-bot";

function formatResult(item: any, index: number) { return `${index + 1}. ${item.title}\n💰 ${Math.round(Number(item.price)).toLocaleString("ru-RU")} ₽${item.oldPrice && item.oldPrice > item.price * 1.03 ? ` (было ${Math.round(Number(item.oldPrice)).toLocaleString("ru-RU")} ₽)` : ""}${item.rating ? ` ⭐ ${item.rating}` : ""}${item.promo ? `\n💳 ${item.promo}` : ""}${item.source ? `\n🏪 ${item.source}` : ""}`; }
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

function isAdminUser(userId: number | string) {
  return adminTelegramIds().has(String(userId));
}

async function sendAdminDeals(supabase: ReturnType<typeof getSupabaseAdmin>, chatId: number) {
  const { data: deals, error } = await supabase
    .from("deals")
    .select("id, current_price, reference_price, discount_percent, deal_score, deal_level, products(title, url, source, image_url)")
    .eq("status", "candidate")
    .order("deal_score", { ascending: false })
    .limit(10);
  if (error) throw error;
  if (!deals?.length) {
    await sendTelegramBotMessage(chatId, "Пока нет предложений. Фоновый Scout ищет сделки сам, пока бот работает — загляни позже.", mainMenuKeyboard());
    return;
  }
  for (const deal of deals) {
    const product = Array.isArray(deal.products) ? deal.products[0] : deal.products;
    if (!product) continue;
    const price = Math.round(Number(deal.current_price)).toLocaleString("ru-RU");
    const ref = Math.round(Number(deal.reference_price)).toLocaleString("ru-RU");
    const text = `🔥 ${product.title.slice(0, 80)}\n💰 ${price} ₽ (было ${ref} ₽, −${Math.round(Number(deal.discount_percent))}%)\n🏪 ${product.source ?? ""} · AI Score: ${deal.deal_score}/100`;
    await sendTelegramBotMessage(chatId, text, {
      inline_keyboard: [[
        { text: "✅ Одобрить", callback_data: `admin:approve:${deal.id}` },
        { text: "❌ Отклонить", callback_data: `admin:reject:${deal.id}` },
      ]],
    });
  }
}

async function handleAdminCommand(supabase: ReturnType<typeof getSupabaseAdmin>, chatId: number, userId: number | string, text: string) {
  const arg = text.replace(/^\/admin(@\w+)?\s*/, "").trim();
  if (arg === "stats") {
    const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
    const [searches, clicks, approved] = await Promise.all([
      supabase.from("search_requests").select("id", { count: "exact", head: true }).gte("created_at", since),
      supabase.from("link_clicks").select("id", { count: "exact", head: true }).gte("clicked_at", since),
      supabase.from("deals").select("id", { count: "exact", head: true }).eq("status", "approved"),
    ]);
    await sendTelegramBotMessage(chatId, `📊 За 24 часа:\n🔎 Поисков: ${searches.count ?? 0}\n🔗 Кликов: ${clicks.count ?? 0}\n✅ Одобрено сделок: ${approved.count ?? 0}\n\n/admin — панель и список кандидатов`, mainMenuKeyboard());
    return;
  }
  const webAppUrl = process.env.ADMIN_WEBAPP_URL?.trim() || process.env.PUBLIC_SITE_URL?.trim();
  if (webAppUrl) {
    const url = webAppUrl.replace(/\/$/, "") + "/admin";
    try { await setTelegramMenuButton(chatId, url); } catch { /* non-critical */ }
    await sendTelegramBotMessage(chatId, "🖥 Панель модератора — кнопка внизу чата и в меню ☰.", adminReplyKeyboard(url));
  } else {
    await sendTelegramBotMessage(chatId, "Кандидаты на модерацию:", mainMenuKeyboard());
  }
  await sendAdminDeals(supabase, chatId);
}

async function handleAdminAction(supabase: ReturnType<typeof getSupabaseAdmin>, chatId: number, data: string, messageId: number | undefined) {
  const [action, dealId] = data.replace(/^admin:/, "").split(":");
  try {
    if (action === "approve") {
      const { data: deal } = await supabase
        .from("deals")
        .select("id, product_id, current_price, reference_price, discount_percent, deal_score, deal_level, ai_reason, products(id,title,url,rating,reviews_count,age_label,category,source,available,image_url)")
        .eq("id", dealId)
        .maybeSingle();
      const product = Array.isArray(deal?.products) ? deal?.products[0] : deal?.products;
      if (deal && product) {
        const link = trackedUrlFor(deal.product_id, product.source ?? "unknown", product.url);
        const post = `🎁 Выгодно прямо сейчас!\n\n${product.title}\n\n💰 ${Math.round(Number(deal.current_price)).toLocaleString("ru-RU")} ₽ (было ${Math.round(Number(deal.reference_price)).toLocaleString("ru-RU")} ₽, −${Math.round(Number(deal.discount_percent))}%)\n${product.rating ? `⭐ ${product.rating}\n` : ""}🔗 ${link}`;
        if (process.env.TELEGRAM_BOT_TOKEN?.trim()) {
          const channelId = await getChannelId();
          if (channelId) {
            const sent = await sendTelegramPost(post, channelId);
            const sentResult = sent as { result?: { message_id?: number }; message_id?: number };
            await supabase.from("telegram_posts").insert({ deal_id: deal.id, telegram_message_id: sentResult?.result?.message_id ?? sentResult?.message_id ?? 0, published_price: Number(deal.current_price), post_text: post });
          }
        }
        await supabase.from("deals").update({ status: "approved", published_at: new Date().toISOString() }).eq("id", dealId);
      }
      if (messageId) await editTelegramMessage(chatId, messageId, "✅ Одобрено и опубликовано в канал.");
    } else {
      await supabase.from("deals").update({ status: "rejected" }).eq("id", dealId);
      if (messageId) await editTelegramMessage(chatId, messageId, "❌ Отклонено.");
    }
  } catch (error) {
    console.error("Admin action failed", error);
    await sendTelegramBotMessage(chatId, "Не получилось выполнить действие. Попробуй ещё раз.", mainMenuKeyboard());
  }
}

async function main() {
  const supabase = getSupabaseAdmin(); const lockToken = randomUUID(); if (!(await acquireBotLock(supabase, lockToken))) { console.log("Telegram bot is already running; exiting."); return; }
  try {
    await deleteTelegramWebhook();
    // Background Scout runs alongside the bot: no separate npm command needed.
    if (process.env.KETTU_DIR?.trim() && !process.env.SCOUT_DISABLED) {
      const scoutLoop = async () => {
        try { await scoutSweepOnce(); } catch (error) { console.error("Scout sweep failed", error); }
        setTimeout(scoutLoop, scoutIntervalMs());
      };
      setTimeout(scoutLoop, 15000);
    }
    const { data: latestUpdate, error: latestUpdateError } = await supabase.from("telegram_bot_updates").select("update_id").order("update_id", { ascending: false }).limit(1).maybeSingle(); if (latestUpdateError) throw latestUpdateError;
    const updates = await getTelegramUpdates(latestUpdate ? Number(latestUpdate.update_id) + 1 : undefined);
    for (const update of updates) {
      if (!(await refreshBotLock(supabase, lockToken))) break;
      const callback = update.callback_query; if (callback) { await answerTelegramCallback(callback.id); const chatId = callback.message?.chat.id; if (!chatId) continue; const cbUserId = callback.from?.id ?? chatId; if (callback.data === "menu:search") await sendTelegramBotMessage(chatId, "🔎 Просто напиши, что ищем — я продолжу разговор сама.", mainMenuKeyboard()); else if (callback.data === "menu:photo") await sendTelegramBotMessage(chatId, "📸 Пришли фотографию товара — попробую определить его и продолжу поиск.", mainMenuKeyboard()); else if (callback.data === "menu:watches") await sendWatchesList(supabase, chatId, cbUserId); else if (callback.data === "menu:support" || callback.data === "support:start") await sendTelegramBotMessage(chatId, "💬 Я здесь 🙂 Просто напиши мне сообщение обычным текстом.", mainMenuKeyboard()); else if (callback.data?.startsWith("unwatch:")) { await removePriceAlert(Number(cbUserId), callback.data.slice(8)); await sendWatchesList(supabase, chatId, cbUserId); } else if (callback.data?.startsWith("watch:")) { const productId = callback.data.slice(6); try { await addPriceAlert({ telegramUserId: Number(cbUserId), chatId, productId }); await sendTelegramBotMessage(chatId, "🔔 Буду следить за этим товаром и напишу, когда подешевеет. Чтобы задать желаемую цену, отправь: /watch <id> <цена>.", mainMenuKeyboard()); } catch { await sendTelegramBotMessage(chatId, "Не смогла оформить подписку на этот товар.", mainMenuKeyboard()); } } else if (isAdminUser(cbUserId) && (callback.data?.startsWith("admin:approve:") || callback.data?.startsWith("admin:reject:"))) { await handleAdminAction(supabase, chatId, callback.data, callback.message?.message_id); } continue; }
      // Auto-detect the publishing channel: the bot was added there as admin
      // (my_chat_member), or an admin forwarded a post from it.
      const membership = update.my_chat_member;
      if (membership?.chat?.type === "channel" && membership.new_chat_member?.status === "administrator") {
        try {
          await setChannelId(membership.chat.id);
          await sendTelegramBotMessage(membership.chat.id, "✅ Канал подключён для публикации! Одобренные сделки будут появляться здесь.");
        } catch (error) { console.error("Channel registration failed", error); }
        continue;
      }
      const channelPost = update.channel_post ?? update.edited_channel_post;
      if (channelPost?.chat?.type === "channel" && channelPost.sender_chat?.id) {
        try { await setChannelId(channelPost.sender_chat.id); } catch { /* non-critical */ }
        continue;
      }
      const message = update.message; if (!message?.chat?.id) continue; const { error: updateError } = await supabase.from("telegram_bot_updates").insert({ update_id: update.update_id }); if (updateError?.code === "23505") continue; if (updateError) throw updateError;
      const text = normalizeSearchQuery(message.text ?? message.caption ?? ""); const userId = message.from?.id ?? message.chat.id;
      const forwardChat = (message as any).forward_from_chat;
      if (forwardChat?.type === "channel" && isAdminUser(userId)) {
        try {
          await setChannelId(forwardChat.id);
          await sendTelegramBotMessage(message.chat.id, `✅ Канал «${forwardChat.title ?? "без названия"}» подключён для публикации.`, mainMenuKeyboard());
        } catch (error) { console.error("Channel registration via forward failed", error); }
        continue;
      }
      if (text === "/start" || text.startsWith("/start ") || text === "/help") {
        if (isAdminUser(userId)) {
          const webAppUrl = process.env.ADMIN_WEBAPP_URL?.trim() || process.env.PUBLIC_SITE_URL?.trim();
          if (webAppUrl) {
            const url = webAppUrl.replace(/\/$/, "") + "/admin";
            try { await setTelegramMenuButton(message.chat.id, url); } catch (menuError) { console.error("Menu button setup failed", menuError); }
            await sendTelegramBotMessage(message.chat.id, startText(message.from?.first_name) + "\n\n🖥 Кнопка панели — внизу чата.", adminReplyKeyboard(url));
          } else {
            await sendTelegramBotMessage(message.chat.id, startText(message.from?.first_name), mainMenuKeyboard());
          }
        } else {
          await sendTelegramBotMessage(message.chat.id, startText(message.from?.first_name), mainMenuKeyboard());
        }
        continue;
      }
      const watch = parseWatchCommand(text); if (watch) { const { data: product, error } = await supabase.from("products").select("id,title").eq("id", watch.productId).maybeSingle(); if (error) throw error; if (!product) await sendTelegramBotMessage(message.chat.id, "Не нашла такой товар."); else { await addPriceAlert({ telegramUserId: userId, chatId: message.chat.id, productId: product.id, targetPrice: watch.targetPrice }); await sendTelegramBotMessage(message.chat.id, `🔔 Буду следить за «${product.title}»${watch.targetPrice ? ` до ${Math.round(watch.targetPrice)} ₽` : " при снижении цены"}.`, mainMenuKeyboard()); } continue; }
      const unwatch = parseUnwatchCommand(text); if (unwatch) { await removePriceAlert(userId, unwatch); await sendTelegramBotMessage(message.chat.id, "🔕 Отслеживание цены отключено.", mainMenuKeyboard()); continue; }
      if (text === "/watches") { await sendWatchesList(supabase, message.chat.id, userId); continue; }
      if (isAdminUser(userId) && text.startsWith("/admin")) { await handleAdminCommand(supabase, message.chat.id, userId, text); continue; }
      if (message.photo?.length) { try { await sendTelegramBotMessage(message.chat.id, "📸 Смотрю на фото…"); const largestPhoto = [...message.photo].sort((a, b) => b.width * b.height - a.width * a.height)[0]; if (!largestPhoto) continue; const photoSearch = await searchByPhoto(await getTelegramPhotoUrl(largestPhoto.file_id), 5); const detected = photoSearch.analysis.query; const webResults = await searchWebProducts(detected, 5); await sendTelegramBotMessage(message.chat.id, `👀 Похоже, ищем: ${detected}`); await sendResults(message.chat.id, [...photoSearch.results, ...webResults]); } catch (error) { console.error("Photo search failed", error); await sendTelegramBotMessage(message.chat.id, "Не смогла распознать фото. Попробуй более чёткое фото или опиши товар словами.", mainMenuKeyboard()); } continue; }
      if (!text) continue;
      const SOURCE_LABELS: Record<string, string> = { wildberries: "Wildberries", yandex_market: "Яндекс Маркет", megamarket: "Мегамаркет", ozon: "Ozon", lamoda: "Lamoda", dns: "DNS", citilink: "Ситилинк", avito: "Avito", taobao: "Taobao", detmir: "Детский мир" };
      const progressLines = new Map<string, string>();
      const startedAt = Date.now();
      let progressMessageId: number | undefined;
      let lastEditAt = 0;
      const renderProgress = () => {
        const secs = Math.floor((Date.now() - startedAt) / 1000);
        const timer = `⏱ ${String(Math.floor(secs / 60)).padStart(2, "0")}:${String(secs % 60).padStart(2, "0")}`;
        return `🔎 Ищу лучшую цену...\n\n${[...progressLines.values()].join("\n")}\n\n${timer}`;
      };
      const editProgress = async (force = false) => {
        if (!progressMessageId) return;
        if (!force && Date.now() - lastEditAt < 1800) return;
        lastEditAt = Date.now();
        try { await editTelegramMessage(message.chat.id, progressMessageId, renderProgress()); } catch { /* ignore edit failures, the interval will retry */ }
      };
      const onEvent = (event: any) => {
        if (event.type === "SEARCH_STARTED") {
          void sendTelegramBotMessage(message.chat.id, "🔎 Ищу лучшую цену...\n\n⏱ 00:00")
            .then((sent: any) => { progressMessageId = sent?.message_id; void editProgress(true); })
            .catch(() => {});
          return;
        }
        const label = SOURCE_LABELS[event.source] ?? event.source;
        if (event.type === "SOURCE_STARTED") progressLines.set(event.source, `⟳ ${label} — ищем…`);
        else if (event.type === "SOURCE_COMPLETED") progressLines.set(event.source, `✓ ${label} — ${event.count}`);
        else if (event.type === "SOURCE_FAILED") progressLines.set(event.source, `✗ ${label}`);
        else if (event.type === "SOURCE_SKIPPED") progressLines.set(event.source, `⚠️ ${label} — ${event.reason}`);
        else if (event.type === "MATCHING_STARTED") progressLines.set("matching", "⟳ Сопоставляю товары…");
        else if (event.type === "PRICE_CHECK_STARTED") { progressLines.set("matching", "✓ Сопоставили товары"); progressLines.set("price", "⟳ Проверяю цены и скидки…"); }
        else if (event.type === "VERIFICATION_STARTED") progressLines.set("price", "✓ Проверили цены и наличие");
        else if (event.type === "BEST_DEAL_FOUND") progressLines.set("best", `🎯 Лучшее: ${Math.round(event.price).toLocaleString("ru-RU")} ₽`);
        void editProgress();
      };
      const progressTimer = setInterval(() => { void editProgress(); }, 2000);
      let result;
      try {
        result = await handleConversation(userId, text, onEvent);
      } finally {
        clearInterval(progressTimer);
      }
      if (progressMessageId) {
        const secs = Math.max(1, Math.round((Date.now() - startedAt) / 1000));
        const finalText = result.results?.length ? `✓ Готово за ${secs} сек. Показываю лучшие варианты 👇` : result.text;
        try { await editTelegramMessage(message.chat.id, progressMessageId, finalText, mainMenuKeyboard()); } catch { /* ignore */ }
      }
      if (result.results) await sendResults(message.chat.id, result.results); else if (!progressMessageId) await sendTelegramBotMessage(message.chat.id, result.text, mainMenuKeyboard());
    }
  } finally { await releaseBotLock(supabase, lockToken); }
}

async function runLoop() {
  while (true) {
    try {
      await main();
    } catch (error) {
      console.error(error);
    }
    if (!process.env.BOT_LOOP) break;
    await new Promise((resolve) => setTimeout(resolve, Number(process.env.BOT_INTERVAL_MS) || 10_000));
  }
}
runLoop().catch((error) => { console.error(error); process.exit(1); });
