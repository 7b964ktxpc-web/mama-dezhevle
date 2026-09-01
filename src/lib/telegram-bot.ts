const API = "https://api.telegram.org/bot";

function requireEnv(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing environment variable: ${name}`);
  return value;
}

async function telegramCall<T>(method: string, body: Record<string, unknown>): Promise<T> {
  const token = requireEnv("TELEGRAM_BOT_TOKEN");
  const response = await fetch(`${API}${token}/${method}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  if (!response.ok) throw new Error(`Telegram API error ${response.status}: ${await response.text()}`);
  const json = await response.json();
  if (!json.ok) throw new Error(`Telegram API error: ${JSON.stringify(json)}`);
  return json.result as T;
}

export type TelegramUpdate = {
  update_id: number;
  message?: {
    message_id: number;
    text?: string;
    caption?: string;
    photo?: Array<{ file_id: string; width: number; height: number; file_size?: number }>;
    chat: { id: number; type: string };
    from?: { id: number; first_name?: string; username?: string };
  };
  callback_query?: {
    id: string;
    data?: string;
    message?: { message_id: number; chat: { id: number }; text?: string };
    from?: { id: number; first_name?: string; username?: string };
  };
};

type TelegramFile = { file_path: string };

export async function getTelegramUpdates(offset?: number, timeout = 25) {
  return telegramCall<TelegramUpdate[]>("getUpdates", { offset, timeout, allowed_updates: ["message", "callback_query"] });
}

export async function deleteTelegramWebhook() {
  try {
    return await telegramCall("deleteWebhook", { drop_pending_updates: false });
  } catch (error) {
    console.error("deleteWebhook failed", error);
    return null;
  }
}

export async function getTelegramPhotoUrl(fileId: string) {
  const file = await telegramCall<TelegramFile>("getFile", { file_id: fileId });
  const token = requireEnv("TELEGRAM_BOT_TOKEN");
  return `https://api.telegram.org/file/bot${token}/${file.file_path}`;
}

export async function sendTelegramBotMessage(chatId: number | string, text: string, replyMarkup?: Record<string, unknown>) {
  return telegramCall("sendMessage", { chat_id: chatId, text, disable_web_page_preview: false, ...(replyMarkup ? { reply_markup: replyMarkup } : {}) });
}

export async function editTelegramMessage(chatId: number | string, messageId: number, text: string, replyMarkup?: Record<string, unknown>) {
  return telegramCall("editMessageText", { chat_id: chatId, message_id: messageId, text, ...(replyMarkup ? { reply_markup: replyMarkup } : {}) });
}

export async function answerTelegramCallback(callbackQueryId: string, text?: string) {
  return telegramCall("answerCallbackQuery", { callback_query_id: callbackQueryId, ...(text ? { text, show_alert: false } : {}) });
}

export function mainMenuKeyboard() {
  return { inline_keyboard: [[{ text: "🔎 Найти дешевле", callback_data: "menu:search" }, { text: "📸 По фото", callback_data: "menu:photo" }], [{ text: "🔔 Мои скидки", callback_data: "menu:watches" }, { text: "💬 Живое общение", callback_data: "menu:support" }]] };
}

import { trackedUrlFor } from "./affiliate";

export function resultKeyboard(item: { id?: string; url?: string; source?: string }) {
  const row: Array<Record<string, string>> = [];
  if (item.url) row.push({ text: "🛒 Открыть товар", url: trackedUrlFor(item.id, item.source, item.url) });
  if (item.id) row.push({ text: "🔔 Следить", callback_data: `watch:${item.id}` });
  return { inline_keyboard: row.length ? [row] : [] };
}

export function supportKeyboard() {
  return { inline_keyboard: [[{ text: "💬 Написать оператору", callback_data: "support:start" }], [{ text: "🔎 Новый поиск", callback_data: "menu:search" }]] };
}

export function startText(firstName?: string) {
  const name = firstName ? `, ${firstName}` : "";
  return [`Привет${name}! 👋`, "Я — бот «Мама, дешевле!».", "", "Напиши, что нужно найти. Например:", "👕 рубашка мальчику 3 года до 1500 ₽", "👟 кроссовки девочке 30 размера до 2500 ₽", "", "Или просто пришли 📸 фото — попробую определить товар и найти похожие варианты дешевле.", "", "Можно общаться со мной обычными сообщениями — не обязательно использовать команды.", "Если понадобится человек, нажми «💬 Живое общение».", "", "Мои подписки: /watches"].join("\n");
}

export function normalizeSearchQuery(text: string) { return text.replace(/\s+/g, " ").trim().slice(0, 1000); }
export function searchReply(query: string) { return ["🔎 Запрос сохранён:", `«${query}»`, "", "Когда каталог будет подключён, здесь появятся несколько самых выгодных вариантов."].join("\n"); }
export function parseWatchCommand(text: string) { const match = text.trim().match(/^\/watch(?:@\w+)?\s+(\S+)(?:\s+(\d+(?:[.,]\d+)?))?$/i); if (!match) return null; return { productId: match[1], targetPrice: match[2] ? Number(match[2].replace(",", ".")) : null }; }
export function parseUnwatchCommand(text: string) { const match = text.trim().match(/^\/unwatch(?:@\w+)?\s+(\S+)$/i); return match ? match[1] : null; }
