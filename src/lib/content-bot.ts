import { getSupabaseAdmin } from "./supabase-admin";

const API = "https://api.telegram.org/bot";
const MAX_TEXT = 4096;

function env(name: string) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing environment variable: ${name}`);
  return value;
}

async function tg(method: string, body: Record<string, unknown>) {
  const response = await fetch(`${API}${env("CONTENT_BOT_TOKEN")}/${method}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await response.json() as { ok?: boolean; result?: any; description?: string };
  if (!response.ok || !data.ok) throw new Error(`Telegram ${method} failed: ${data.description ?? "unknown error"}`);
  return data.result;
}

function adminId() { return env("CONTENT_ADMIN_CHAT_ID"); }
function channelId() { return env("TELEGRAM_CHANNEL_ID"); }

function keyboard(id: string) {
  return { inline_keyboard: [
    [{ text: "✅ Одобрить и опубликовать", callback_data: `approve:${id}` }],
    [{ text: "🔄 Переделать", callback_data: `regenerate:${id}` }, { text: "❌ Отклонить", callback_data: `reject:${id}` }],
  ] };
}

export async function sendDraftForApproval(post: { id: string; rubric: string; topic: string; body: string }) {
  const text = `📝 НОВЫЙ КОНТЕНТ\n\nРубрика: ${post.rubric}\nТема: ${post.topic}\n\n${post.body}`.slice(0, MAX_TEXT);
  return tg("sendMessage", { chat_id: adminId(), text, reply_markup: keyboard(post.id), disable_web_page_preview: true });
}

export async function publishApprovedPost(post: { id: string; body: string }) {
  return tg("sendMessage", { chat_id: channelId(), text: post.body.slice(0, MAX_TEXT), disable_web_page_preview: true });
}

export async function answerCallback(callbackQueryId: string, text: string) {
  return tg("answerCallbackQuery", { callback_query_id: callbackQueryId, text, show_alert: false });
}

export async function notifyAdmin(text: string) {
  return tg("sendMessage", { chat_id: adminId(), text });
}

export async function getContentBotUpdates(offset?: number) {
  return tg("getUpdates", { offset, timeout: 0, allowed_updates: ["message", "callback_query"] }) as Promise<any[]>;
}
