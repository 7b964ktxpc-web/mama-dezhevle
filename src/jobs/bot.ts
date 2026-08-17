import { getSupabaseAdmin } from "../lib/supabase-admin";
import { searchProducts } from "../lib/product-search";
import {
  getTelegramUpdates,
  normalizeSearchQuery,
  searchReply,
  sendTelegramBotMessage,
  startText,
} from "../lib/telegram-bot";

function formatResults(results: Awaited<ReturnType<typeof searchProducts>>) {
  if (!results.length) return "🔎 Пока ничего подходящего не нашла. Попробуй изменить запрос или бюджет.";

  return [
    `🔎 Нашла ${results.length} вариант${results.length === 1 ? "" : "а"}:`,
    "",
    ...results.map((item, index) => {
      const rating = item.rating ? ` ⭐ ${item.rating}` : "";
      const oldPrice = item.oldPrice ? ` (было ${Math.round(item.oldPrice).toLocaleString("ru-RU")} ₽)` : "";
      return `${index + 1}. ${item.title}\n💰 ${Math.round(item.price).toLocaleString("ru-RU")} ₽${oldPrice}${rating}\n👉 ${item.url}`;
    }),
  ].join("\n\n");
}

async function main() {
  const supabase = getSupabaseAdmin();
  const updates = await getTelegramUpdates();

  for (const update of updates) {
    const message = update.message;
    if (!message?.chat?.id) continue;

    const updateId = update.update_id;
    const { error: updateError } = await supabase
      .from("telegram_bot_updates")
      .insert({ update_id: updateId });

    if (updateError?.code === "23505") continue;
    if (updateError) throw updateError;

    const text = normalizeSearchQuery(message.text ?? "");
    if (!text) continue;

    if (text === "/start" || text.startsWith("/start ")) {
      await sendTelegramBotMessage(message.chat.id, startText(message.from?.first_name));
      continue;
    }

    const userId = message.from?.id ?? message.chat.id;
    const payload = {
      telegram_user_id: userId,
      chat_id: message.chat.id,
      query_text: text,
    };

    const { error } = await supabase.from("search_requests").insert(payload);
    if (error) {
      console.error("Could not save search request", error);
      await sendTelegramBotMessage(message.chat.id, "Не удалось сохранить запрос. Попробуй ещё раз чуть позже.");
      continue;
    }

    try {
      const results = await searchProducts(text, 5);
      await sendTelegramBotMessage(message.chat.id, formatResults(results));
    } catch (error) {
      console.error("Product search failed", error);
      await sendTelegramBotMessage(message.chat.id, searchReply(text));
    }
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
