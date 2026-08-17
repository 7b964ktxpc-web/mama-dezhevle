const API = "https://api.telegram.org/bot";

function requireEnv(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing environment variable: ${name}`);
  return value;
}

async function telegramCall<T>(method: string, body: Record<string, unknown>): Promise<T> {
  const token = requireEnv("TELEGRAM_BOT_TOKEN");
  const response = await fetch(`${API}${token}/${method}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Telegram API error ${response.status}: ${text}`);
  }

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
};

type TelegramFile = { file_path: string };

export async function getTelegramUpdates(offset?: number) {
  return telegramCall<TelegramUpdate[]>("getUpdates", {
    offset,
    timeout: 0,
    allowed_updates: ["message"],
  });
}

export async function getTelegramPhotoUrl(fileId: string) {
  const file = await telegramCall<TelegramFile>("getFile", { file_id: fileId });
  const token = requireEnv("TELEGRAM_BOT_TOKEN");
  return `https://api.telegram.org/file/bot${token}/${file.file_path}`;
}

export async function sendTelegramBotMessage(chatId: number | string, text: string) {
  return telegramCall("sendMessage", {
    chat_id: chatId,
    text,
    disable_web_page_preview: false,
  });
}

export function startText(firstName?: string) {
  const name = firstName ? `, ${firstName}` : "";
  return [
    `Привет${name}! 👋`,
    "Я — бот «Мама, дешевле!».",
    "",
    "Напиши, что нужно найти. Например:",
    "👕 рубашка мальчику 3 года до 1500 ₽",
    "👟 кроссовки девочке 30 размера до 2500 ₽",
    "",
    "Или просто пришли 📸 фото — попробую определить товар и найти похожие варианты дешевле.",
  ].join("\n");
}

export function normalizeSearchQuery(text: string) {
  return text.replace(/\s+/g, " ").trim().slice(0, 1000);
}

export function searchReply(query: string) {
  return [
    "🔎 Запрос сохранён:",
    `«${query}»`,
    "",
    "Когда каталог будет подключён, здесь появятся несколько самых выгодных вариантов.",
  ].join("\n");
}
