import { getSupabaseAdmin } from "./supabase-admin";

const DEFAULT_MODEL = "gemini-3.5-flash-lite";
const API_BASE = "https://generativelanguage.googleapis.com/v1beta/models";
const TIMEOUT_MS = 20_000;

export type ContentDraft = {
  contentType: string;
  rubric: string;
  topic: string;
  body: string;
};

const RUBRICS = [
  "Живой разговор",
  "Мама поймёт",
  "Мамины истории",
  "Полезно без занудства",
  "Опрос",
  "Вечерний разговор",
];

const FALLBACKS: Array<Omit<ContentDraft, "topic"> & { topic: string }> = [
  { contentType: "discussion", rubric: "Живой разговор", topic: "Мамины покупки", body: "Мамы, а у вас бывает такое: идёшь за одной нужной вещью, а возвращаешься домой с пакетом всего на свете? 😂\n\nЧто вы чаще всего покупаете спонтанно? Рассказывайте — интересно сравнить наши «ну раз уж пришла» покупки 👀" },
  { contentType: "discussion", rubric: "Мама поймёт", topic: "Пять минут тишины", body: "Вопрос дня 😂\n\nЕсли вам подарят прямо сейчас 30 минут полной тишины и никто ничего не просит — что вы сделаете?\n\n☕ Выпью кофе\n😴 Лягу спать\n📱 Залипну в телефон\n🧹 Сделаю дела, которые давно откладываю\n\nА свой вариант пишите в комментариях ❤️" },
  { contentType: "discussion", rubric: "Вечерний разговор", topic: "Мамины маленькие радости", body: "Иногда счастье — это вообще не что-то большое ❤️\n\nТёплый чай, ребёнок наконец уснул, никто не зовёт, дома тихо… и можно просто пять минут посидеть.\n\nА какая маленькая вещь сегодня порадовала вас? Давайте соберём здесь список маминых радостей 🥰" },
];

function env(name: string) { return process.env[name]?.trim() || ""; }

function cleanJson(text: string) {
  return text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
}

function normalizeDraft(value: unknown): ContentDraft | null {
  if (!value || typeof value !== "object") return null;
  const item = value as Record<string, unknown>;
  const body = typeof item.body === "string" ? item.body.trim() : "";
  const topic = typeof item.topic === "string" ? item.topic.trim() : "";
  const rubric = typeof item.rubric === "string" ? item.rubric.trim() : "";
  const contentType = typeof item.contentType === "string" ? item.contentType.trim() : "discussion";
  if (!body || !topic || !rubric || body.length > 4096) return null;
  return { contentType, rubric, topic, body };
}

async function generateWithGemini(recent: string[]) {
  const apiKey = env("CONTENT_AI_API_KEY") || env("GEMINI_API_KEY") || env("AI_API_KEY");
  if (!apiKey) return null;
  const model = env("CONTENT_AI_MODEL") || env("GEMINI_MODEL") || env("AI_MODEL") || DEFAULT_MODEL;
  const prompt = [
    "Ты контент-мейкер Telegram-сообщества «Мама, дешевле!».",
    "Главная цель — живое общение мам, комментарии и ощущение настоящего сообщества.",
    "Не продавай товары. Не ищи товары. Не используй цены, скидки, ссылки, маркетплейсы или промокоды.",
    "Пиши по-русски, тепло, естественно, современно, без канцелярита и рекламного тона.",
    "Не изображай врача и не давай медицинских советов.",
    "Сделай один самостоятельный пост. Допустимы юмор, вопрос, опрос или бытовая история.",
    "Не повторяй недавние темы.",
    `Выбери рубрику: ${RUBRICS.join(", ")}`,
    `Недавние темы: ${recent.length ? recent.join("; ") : "нет"}`,
    "Верни только JSON: {contentType:string,rubric:string,topic:string,body:string}.",
    "body должен быть готов к публикации и не содержать служебных пояснений.",
  ].join("\n");

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetch(`${API_BASE}/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ contents: [{ role: "user", parts: [{ text: prompt }] }], generationConfig: { responseMimeType: "application/json", temperature: 0.9 } }),
      signal: controller.signal,
    });
    if (!response.ok) return null;
    const payload = await response.json() as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> };
    const text = payload.candidates?.[0]?.content?.parts?.map((part) => part.text ?? "").join("").trim();
    if (!text) return null;
    return normalizeDraft(JSON.parse(cleanJson(text)));
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export async function generateContentDraft(): Promise<ContentDraft> {
  const supabase = getSupabaseAdmin();
  const { data } = await supabase.from("content_posts").select("topic").order("created_at", { ascending: false }).limit(20);
  const recent = (data ?? []).map((item) => String(item.topic)).filter(Boolean);
  const aiDraft = await generateWithGemini(recent);
  if (aiDraft) return aiDraft;
  const index = recent.length % FALLBACKS.length;
  return FALLBACKS[index];
}
