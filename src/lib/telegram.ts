const API = "https://api.telegram.org/bot";
const MAX_MESSAGE_LENGTH = 4096;
const REQUEST_TIMEOUT_MS = 15_000;
const MAX_RETRIES = 3;

type TelegramMessage = {
  message_id: number;
  [key: string]: unknown;
};

type TelegramResponse = {
  ok: boolean;
  result?: TelegramMessage;
  [key: string]: unknown;
};

function requireEnv(name: string) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing environment variable: ${name}`);
  return value;
}

function splitMessage(text: string) {
  if (text.length <= MAX_MESSAGE_LENGTH) return [text];
  const chunks: string[] = [];
  let rest = text;
  while (rest.length > MAX_MESSAGE_LENGTH) {
    let cut = rest.lastIndexOf("\n", MAX_MESSAGE_LENGTH);
    if (cut < Math.floor(MAX_MESSAGE_LENGTH * 0.6)) cut = MAX_MESSAGE_LENGTH;
    chunks.push(rest.slice(0, cut));
    rest = rest.slice(cut).replace(/^\n+/, "");
  }
  if (rest) chunks.push(rest);
  return chunks;
}

async function sendOne(token: string, chatId: string, text: string): Promise<TelegramResponse> {
  let lastError = "";
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      const response = await fetch(`${API}${token}/sendMessage`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          chat_id: chatId,
          text,
          parse_mode: "Markdown",
          disable_web_page_preview: false,
        }),
        signal: controller.signal,
      });

      const body = await response.text();
      if (response.ok) return JSON.parse(body) as TelegramResponse;

      if (response.status === 400 && /parse entities|can't parse/i.test(body)) {
        const fallback = await fetch(`${API}${token}/sendMessage`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ chat_id: chatId, text, disable_web_page_preview: false }),
          signal: controller.signal,
        });
        const fallbackBody = await fallback.text();
        if (fallback.ok) return JSON.parse(fallbackBody) as TelegramResponse;
        lastError = `Telegram fallback error ${fallback.status}: ${fallbackBody}`;
        break;
      }

      lastError = `Telegram API error ${response.status}: ${body}`;
      if (![408, 425, 429, 500, 502, 503, 504].includes(response.status)) break;
      const retryAfter = Number(response.headers.get("retry-after") ?? 0);
      await new Promise((resolve) => setTimeout(resolve, retryAfter > 0 ? retryAfter * 1000 : attempt * 1000));
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
      if (attempt < MAX_RETRIES) await new Promise((resolve) => setTimeout(resolve, attempt * 1000));
    } finally {
      clearTimeout(timer);
    }
  }
  throw new Error(lastError || "Telegram request failed");
}

export async function sendTelegramPost(text: string) {
  const token = requireEnv("TELEGRAM_BOT_TOKEN");
  const chatId = requireEnv("TELEGRAM_CHANNEL_ID");
  const chunks = splitMessage(text);
  const messages: TelegramResponse[] = [];
  for (const chunk of chunks) messages.push(await sendOne(token, chatId, chunk));

  // Keep the historical return shape for single-message callers. For split posts,
  // expose the first message as `result` and all message ids as `messages` so callers
  // do not treat a successful multi-message delivery as a failure.
  if (messages.length === 1) return messages[0];
  return {
    ok: messages.every((message) => message.ok),
    result: messages[0].result,
    messages: messages.map((message) => message.result).filter(Boolean),
  };
}
