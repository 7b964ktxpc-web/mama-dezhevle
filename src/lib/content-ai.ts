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

const FALLBACKS: ContentDraft[] = [
  { contentType: "discussion", rubric: "Живой разговор", topic: "Мамины покупки", body: "Мамы, а у вас бывает такое: идёшь за одной нужной вещью, а возвращаешься домой с пакетом всего на свете? 😂\n\nЧто вы чаще всего покупаете спонтанно? Рассказывайте — интересно сравнить наши «ну раз уж пришла» покупки 👀" },
  { contentType: "poll", rubric: "Мама поймёт", topic: "Пять минут тишины", body: "Вопрос дня 😂\n\nЕсли вам подарят прямо сейчас 30 минут полной тишины и никто ничего не просит — что вы сделаете?\n\n☕ Выпью кофе\n😴 Лягу спать\n📱 Залипну в телефон\n🧹 Сделаю дела, которые давно откладываю\n\nА свой вариант пишите в комментариях ❤️" },
  { contentType: "discussion", rubric: "Вечерний разговор", topic: "Мамины маленькие радости", body: "Иногда счастье — это вообще не что-то большое ❤️\n\nТёплый чай, ребёнок наконец уснул, никто не зовёт, дома тихо… и можно просто пять минут посидеть.\n\nА какая маленькая вещь сегодня порадовала вас? Давайте соберём здесь список маминых радостей 🥰" },
  { contentType: "discussion", rubric: "Мама поймёт", topic: "Фраза, которую мама слышит сто раз", body: "Мамы, какая фраза от ребёнка у вас звучит чаще всего? 😂\n\n«Мам, смотри!» — уже можно считать отдельным видом спорта.\n\nПишите свою фирменную фразу — посмотрим, у кого сегодня чемпионство 👇" },
  { contentType: "discussion", rubric: "Живой разговор", topic: "Утро без кофе", body: "Честный опрос без осуждения 😂\n\nКто вы утром?\n\n☕ Сначала кофе, потом человек\n😴 Где я и какой сегодня день?\n🏃 Уже всех собрала и сама не поняла как\n✨ Просыпаюсь бодрой — да, такие тоже существуют\n\nА как у вас проходит первое утро после будильника?" },
  { contentType: "discussion", rubric: "Мамины истории", topic: "Самая неожиданная мамина суперсила", body: "Кажется, после появления детей у мам появляется суперспособность находить потерянные вещи по звуку 😂\n\nКлючи? Нашлись. Носок? Нашёлся. Игрушка, которую ребёнок искал полчаса? Конечно, нашлась у мамы.\n\nКакая суперсила появилась у вас после рождения ребёнка? ❤️" },
  { contentType: "discussion", rubric: "Полезно без занудства", topic: "Мамины находки для быта", body: "Давайте соберём маленькую копилку маминых лайфхаков ❤️\n\nКакой простой бытовой трюк реально облегчает вам жизнь? Такой, который хочется рассказать подруге.\n\nПишите в комментариях — лучшие идеи соберём в отдельный пост 👇" },
  { contentType: "poll", rubric: "Опрос", topic: "Когда дома наконец тихо", body: "Дети уснули. В доме тишина. И вот тут главный вопрос 😂\n\nЧто вы делаете первым делом?\n\n🛋 Просто лежу\n📱 Телефон\n☕ Чай\n🧹 Быстро доделаю дела\n🎬 Включу что-нибудь посмотреть\n\nА может, у вас есть свой секретный ритуал?" },
  { contentType: "discussion", rubric: "Вечерний разговор", topic: "Что сегодня получилось", body: "Мамы, давайте сегодня без списка того, что не успели ❤️\n\nНазовите одну вещь, которая сегодня у вас получилась. Даже если это просто «я спокойно выпила чай» — это уже достижение 😄\n\nЧто получилось у вас сегодня?" },
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
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: { responseMimeType: "application/json" },
      }),
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
  const { data } = await supabase.from("content_posts").select("topic").order("created_at", { ascending: false }).limit(50);
  const recent = (data ?? []).map((item) => String(item.topic)).filter(Boolean);
  const aiDraft = await generateWithGemini(recent);
  if (aiDraft) return aiDraft;
  const unused = FALLBACKS.find((draft) => !recent.includes(draft.topic));
  return unused ?? FALLBACKS[recent.length % FALLBACKS.length];
}
