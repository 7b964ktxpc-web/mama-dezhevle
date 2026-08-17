import { getSupabaseAdmin } from "../lib/supabase-admin";
import {
  getTelegramUpdates,
  normalizeSearchQuery,
  searchReply,
  sendTelegramBotMessage,
  startText,
} from "../lib/telegram-bot";

async function main() {
  const supabase = getSupabaseAdmin();
  const updates = await getTelegramUpdates();

  for (const update of updates) {
    const message = update.message;
    if (!message?.chat?.id) continue;

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

    await sendTelegramBotMessage(message.chat.id, searchReply(text));
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
