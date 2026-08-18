import { getSupabaseAdmin } from "../lib/supabase-admin";

const API = "https://api.telegram.org/bot";
const MAX_TEXT = 4096;

function env(name: string) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing environment variable: ${name}`);
  return value;
}

async function tg(method: string, body: Record<string, unknown>) {
  const response = await fetch(`${API}${env("TELEGRAM_BOT_TOKEN")}/${method}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await response.json();
  if (!response.ok || !data.ok) throw new Error(`Telegram ${method} failed: ${JSON.stringify(data)}`);
  return data.result;
}

function menu() {
  return {
    inline_keyboard: [
      [{ text: "🛍 Найти товар", callback_data: "search" }, { text: "🔥 Лучшие скидки", callback_data: "deals" }],
      [{ text: "❤️ Мои товары", callback_data: "tracked" }, { text: "📉 Следить за ценой", callback_data: "track" }],
      [{ text: "🔎 Найди мне дешевле", callback_data: "request" }, { text: "🔔 Уведомления", callback_data: "alerts" }],
      [{ text: "ℹ️ Как это работает", callback_data: "about" }],
    ],
  };
}

async function handleMessage(message: any) {
  const chatId = String(message.chat?.id ?? "");
  if (!chatId) return;
  const text = String(message.text ?? "").trim();
  const supabase = getSupabaseAdmin();

  await supabase.from("telegram_bot_updates").upsert({
    update_id: message.update_id ?? Date.now(),
    chat_id: chatId,
    username: message.from?.username ?? null,
    first_name: message.from?.first_name ?? null,
    text,
    received_at: new Date().toISOString(),
  }, { onConflict: "update_id" });

  if (text === "/start" || text === "/menu") {
    await tg("sendMessage", { chat_id: chatId, text: "Привет! ❤️ Я помогу найти товары для детей и семьи дешевле.\n\nВыбирай, что нужно:", reply_markup: menu() });
    return;
  }

  if (text === "/deals") {
    const { data: deals } = await supabase.from("deals").select("id,current_price,reference_price,discount_percent,deal_score,products(title,url)").eq("status", "candidate").gte("deal_score", 70).order("deal_score", { ascending: false }).limit(5);
    if (!deals?.length) {
      await tg("sendMessage", { chat_id: chatId, text: "Пока не нашла достаточно хорошие предложения. Попробуй ещё раз чуть позже ❤️" });
      return;
    }
    const lines = deals.map((d: any, i: number) => `${i + 1}. ${d.products?.title}\n🔥 ${d.current_price} ₽ вместо ${d.reference_price} ₽\n💰 Экономия ${Math.max(0, Number(d.reference_price) - Number(d.current_price))} ₽\n🔗 ${d.products?.url}`).join("\n\n");
    await tg("sendMessage", { chat_id: chatId, text: `🔥 Лучшие скидки\n\n${lines}`.slice(0, MAX_TEXT), disable_web_page_preview: false });
    return;
  }

  const reply = text ? `🔎 Ищу: «${text}»\n\nПока я собираю подходящие варианты. Сохрани запрос — как только появится действительно выгодное предложение, сможем уведомить тебя. ❤️` : "Выбери действие в меню 👇";
  await tg("sendMessage", { chat_id: chatId, text: reply, reply_markup: menu() });
}

async function main() {
  const offset = Number(process.env.TELEGRAM_UPDATE_OFFSET ?? 0);
  const updates = await tg("getUpdates", { offset, timeout: 0, allowed_updates: ["message"] });
  let maxUpdate = offset - 1;
  for (const update of updates as any[]) {
    maxUpdate = Math.max(maxUpdate, Number(update.update_id));
    if (update.message) await handleMessage(update.message);
  }
  console.log(JSON.stringify({ received: updates.length, nextOffset: maxUpdate + 1 }));
}
main().catch((error) => { console.error(error); process.exit(1); });
