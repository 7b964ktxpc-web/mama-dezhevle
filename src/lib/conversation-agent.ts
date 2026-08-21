import { getSupabaseAdmin } from "./supabase-admin";
import { searchProducts } from "./product-search";
import { searchWebProducts } from "./web-parser-search";

export type ConversationReply = {
  text: string;
  search?: boolean;
  results?: any[];
};

function looksLikeSearch(text: string) {
  return /\b(найди|ищи|поищи|подбери|нужн|купить|ищем|посоветуй|вариант|товар|дешевле|скидк|цен[ау]|руб|₽|размер|лет|года|год|мальчик|девочк|ботин|кроссов|обув|куртк|комбинезон|плать|штаны|игруш|рюкзак)\b/i.test(text);
}

function missingDetails(text: string) {
  const questions: string[] = [];
  if (!/(\d+(?:[.,]\d+)?)\s*(лет|год|года|г\.?)|\b(мальчик|девочк|сын|дочк)\b/i.test(text)) questions.push("Для какого возраста или роста ребёнка ищем?");
  if (!/(до\s*\d|\d+\s*₽|\d+\s*руб)/i.test(text)) questions.push("Какой бюджет примерно заложить?");
  return questions;
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
  // A complete new request must not inherit the bot's welcome/example text or stale
  // age/size values. Short follow-ups such as "а дешевле?" still use user history.
  const standalone = clean.length >= 12 && /\b(найди|ищи|поищи|подбери|нужн|купить|товар|вариант|ботин|кроссов|обув|куртк|игруш|рюкзак)\b/i.test(clean);
  return standalone ? clean : [...userMessages, clean].join(" ");
}

export async function handleConversation(userId: number | string, text: string): Promise<ConversationReply> {
  const clean = text.trim();
  await remember(userId, "user", clean);
  const previous = await history(userId);
  const searchText = userContext(previous, clean);

  if (/^(привет|здравствуй|здравствуйте|добрый|доброе|доброй|хай|hello)\b/i.test(clean)) {
    const reply = "Привет! 👋 Я помогу найти детские товары подешевле. Расскажи, что ищешь — можно совсем обычными словами. Например: «нужны кроссовки сыну 5 лет до 3000 ₽».";
    await remember(userId, "assistant", reply);
    return { text: reply };
  }

  if (/^(спасибо|благодарю|класс|отлично|супер)\b/i.test(clean)) {
    const reply = "Пожалуйста ❤️ Если хочешь, могу ещё поискать дешевле или подобрать похожие варианты.";
    await remember(userId, "assistant", reply);
    return { text: reply };
  }

  if (!looksLikeSearch(clean)) {
    const reply = "Конечно 🙂 Расскажи немного подробнее, что нужно ребёнку. Я могу подобрать товар, сравнить цены и поискать вариант дешевле.";
    await remember(userId, "assistant", reply);
    return { text: reply };
  }

  const missing = missingDetails(searchText);
  if (missing.length) {
    const reply = missing[0];
    await remember(userId, "assistant", reply);
    return { text: reply };
  }

  try {
    console.log(JSON.stringify({ event: "product_search", userId, query: clean, effectiveQuery: searchText }));
    const [catalog, web] = await Promise.all([searchProducts(searchText, 5), searchWebProducts(searchText, 8)]);
    const results = [...catalog, ...web].filter((item: any, index: number, all: any[]) => item?.url ? all.findIndex((x) => x?.url === item.url) === index : true).slice(0, 8);
    const reply = results.length ? `Нашла ${results.length} вариантов. Сейчас покажу самые интересные 👇` : "По этому запросу пока не нашла подходящих вариантов. Давай уточним товар, размер или бюджет?";
    await remember(userId, "assistant", reply);
    return { text: reply, search: true, results };
  } catch (error) {
    console.error("Conversation search failed", error);
    const reply = "Я поняла запрос, но сейчас поиск временно не ответил. Попробуй ещё раз через минуту.";
    await remember(userId, "assistant", reply);
    return { text: reply };
  }
}
