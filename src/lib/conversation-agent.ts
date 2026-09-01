import { getSupabaseAdmin } from "./supabase-admin";
import { searchProducts } from "./product-search";
import { searchWebProducts } from "./web-parser-search";
import { scoutQuery } from "./ai-agents";

export type ConversationReply = {
  text: string;
  search?: boolean;
  results?: any[];
};

function looksLikeSearch(text: string) {
  // Broad product vocabulary is impossible to enumerate; only exclude obvious
  // non-search chatter. Anything with real content is worth a search attempt.
  if (/^(привет|здравствуй|здравствуйте|добрый|доброе|доброй|хай|hello|спасибо|благодарю|класс|отлично|супер|пока|да|нет|ок|ага|ну)\b/i.test(text)) return false;
  return text.replace(/[^a-zа-яё0-9]/gi, "").length >= 3;
}

async function remember(userId: number | string, role: "user" | "assistant", text: string) {
  try {
    const supabase = getSupabaseAdmin();
    await supabase.from("telegram_conversation_messages").insert({ telegram_user_id: userId, role, message_text: text });
  } catch (error) {
    console.error("Conversation memory write failed", error);
  }
}

async function history(userId: number | string) {
  try {
    const supabase = getSupabaseAdmin();
    const { data } = await supabase.from("telegram_conversation_messages").select("role,message_text").eq("telegram_user_id", userId).order("created_at", { ascending: false }).limit(12);
    return (data ?? []).reverse();
  } catch {
    return [];
  }
}

function userContext(previous: Array<{ role: string; message_text: string }>, clean: string) {
  const userMessages = previous.filter((message) => message.role === "user").map((message) => message.message_text).filter(Boolean);
  // A complete new request must not inherit stale age/size values. Short
  // follow-ups such as "а дешевле?" or "32" still use user history.
  const standalone = clean.split(/\s+/).length >= 2 && clean.length >= 8;
  return standalone ? clean : [...userMessages, clean].join(" ");
}

export async function handleConversation(userId: number | string, text: string, onEvent?: (event: import("./kettu-gateway").SearchEvent) => void): Promise<ConversationReply> {
  const clean = text.trim();
  const previous = await history(userId);
  await remember(userId, "user", clean);
  const searchText = userContext(previous, clean);

  const isGreeting = /^(привет|здравствуй|здравствуйте|добрый|доброе|доброй|хай|hello)\b/i.test(clean);
  const isThanks = /^(спасибо|благодарю|класс|отлично|супер)\b/i.test(clean);

  // AI Scout decides intent and builds a clean query when a key is configured.
  // On any failure or absence it returns null and we fall back to regex rules.
  const historyTexts = previous.filter((m) => m.role === "user").map((m) => m.message_text).slice(-4);
  const scout = isGreeting || isThanks ? null : await scoutQuery(clean, historyTexts);

  if (isGreeting) {
    const reply = scout?.reply?.trim() || "Привет! 👋 Я помогу найти детские товары подешевле. Расскажи, что ищешь — можно совсем обычными словами. Например: «нужны кроссовки сыну 5 лет до 3000 ₽».";
    await remember(userId, "assistant", reply);
    return { text: reply };
  }

  if (isThanks) {
    const reply = "Пожалуйста ❤️ Если хочешь, могу ещё поискать дешевле или подобрать похожие варианты.";
    await remember(userId, "assistant", reply);
    return { text: reply };
  }

  if (scout && !scout.isSearch) {
    const reply = scout.reply?.trim() || "Расскажи, что ищем для ребёнка — подберу и сравню цены 🙂";
    await remember(userId, "assistant", reply);
    return { text: reply };
  }

  if (scout?.needsClarification && !scout.query) {
    const reply = scout.needsClarification;
    await remember(userId, "assistant", reply);
    return { text: reply };
  }

  const effectiveQuery = scout?.isSearch && scout.query ? scout.query : searchText;

  if (!scout && !looksLikeSearch(clean)) {
    const reply = "Конечно 🙂 Расскажи немного подробнее, что нужно ребёнку. Я могу подобрать товар, сравнить цены и поискать вариант дешевле.";
    await remember(userId, "assistant", reply);
    return { text: reply };
  }

  try {
    console.log(JSON.stringify({ event: "product_search", userId, query: clean, effectiveQuery, ai: Boolean(scout) }));
    const [catalog, web] = await Promise.all([searchProducts(effectiveQuery, 5), searchWebProducts(effectiveQuery, 8, onEvent)]);
    const results = [...catalog, ...web].filter((item: any, index: number, all: any[]) => item?.url ? all.findIndex((x) => x?.url === item.url) === index : true).slice(0, 8);
    const reply = results.length ? `Нашла ${results.length} вариантов. Сейчас покажу самые интересные 👇` : "По этому запросу пока не нашла подходящих вариантов. Давай уточним товар, размер или бюджет?";
    await remember(userId, "assistant", reply);
    try {
      await getSupabaseAdmin().from("search_requests").insert({ telegram_user_id: Number(userId), chat_id: Number(userId), query_text: clean });
    } catch (insertError) {
      console.error("search_requests insert failed", insertError);
    }
    return { text: reply, search: true, results };
  } catch (error) {
    console.error("Conversation search failed", error);
    const reply = "Я поняла запрос, но сейчас поиск временно не ответил. Попробуй ещё раз через минуту.";
    await remember(userId, "assistant", reply);
    return { text: reply };
  }
}
