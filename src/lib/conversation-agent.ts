import { getSupabaseAdmin } from "./supabase-admin";
import { searchProducts } from "./product-search";
import { searchWebProducts } from "./web-parser-search";

export type ConversationReply = {
  text: string;
  search?: boolean;
  results?: any[];
};

function looksLikeSearch(text: string) {
  return /\b(найди|ищи|поищи|подбери|нужн|купить|ищем|посоветуй|вариант|товар|дешевле|скидк|цен[ау]|руб|₽|размер|лет)\b/i.test(text);
}

function missingDetails(text: string) {
  const questions: string[] = [];
  if (!/(\d+)\s*(лет|год|года)|\b(мальчик|девочк|сын|дочк)\b/i.test(text)) questions.push("Для какого возраста или роста ребёнка ищем?");
  if (!/(до\s*\d+|\d+\s*₽|\d+\s*руб)/i.test(text)) questions.push("Какой бюджет примерно заложить?");
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

export async function handleConversation(userId: number | string, text: string): Promise<ConversationReply> {
  const clean = text.trim();
  await remember(userId, "user", clean);
  const previous = await history(userId);
  const combined = [...previous.map((m) => m.message_text), clean].join(" ");

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

  const missing = missingDetails(combined);
  if (missing.length) {
    const reply = missing[0];
    await remember(userId, "assistant", reply);
    return { text: reply };
  }

  try {
    const [catalog, web] = await Promise.all([searchProducts(combined, 5), searchWebProducts(combined, 8)]);
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
