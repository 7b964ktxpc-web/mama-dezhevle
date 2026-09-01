// AI Scout agent: turns any parent's free-form message into a structured
// search decision. Runs on free-tier providers (Groq Llama-3.3-70B, Gemini
// Flash, OpenRouter free models). Returns null when no key is configured,
// and the caller falls back to deterministic rules.

export type ScoutDecision = {
  isSearch: boolean;
  query: string;
  category?: string | null;
  brand?: string | null;
  size?: string | null;
  maxPrice?: number | null;
  ageYears?: number | null;
  gender?: string | null;
  needsClarification?: string | null;
  reply?: string | null;
};

const SYSTEM_PROMPT = `Ты — Scout, первый агент телеграм-бота «Мама, тут дешевле!», который ищет детские товары по лучшим ценам.
Пользователь — родитель, пишет по-русски обычными словами. Определи его намерение и верни СТРОГО JSON без пояснений:
{
 "isSearch": true|false,
 "query": "короткая поисковая фраза: товар + бренд + размер + возраст (без слов 'найди', 'до N рублей')",
 "category": "товарная категория или null",
 "brand": "бренд или null",
 "size": "размер обуви/одежды или null",
 "maxPrice": число в рублях или null,
 "ageYears": возраст ребёнка в годах или null,
 "gender": "boy|girl|null",
 "needsClarification": "короткий вопрос, только если совсем непонятно что искать, иначе null",
 "reply": "короткий человеческий ответ, если isSearch=false (приветствие, вопрос о боте и т.п.), иначе null"
}
Правила:
- Любое упоминание товара, одежды, обуви, игрушки, техники для ребёнка, а также "дешевле", "скидка", "сравни", "найди", "подбери", "посоветуй" => isSearch=true.
- Приветствие, благодарность, "что ты умеешь", "помощь" => isSearch=false и заполни reply по-русски, дружелюбно, с эмодзи.
- Если пользователь отвечает на уточняющий вопрос бота (например "32" или "мальчику 5 лет"), объедини с историей и верни isSearch=true с полным query.
- Никогда не выдумывай товар: если в сообщении нет ничего товарного и нет истории — needsClarification.`;

function parseJson(text: string): ScoutDecision | null {
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try {
    const raw = JSON.parse(match[0]);
    if (typeof raw?.isSearch !== "boolean") return null;
    return {
      isSearch: raw.isSearch,
      query: String(raw.query ?? "").trim(),
      category: raw.category ?? null,
      brand: raw.brand ?? null,
      size: raw.size ?? null,
      maxPrice: raw.maxPrice == null ? null : Number(raw.maxPrice),
      ageYears: raw.ageYears == null ? null : Number(raw.ageYears),
      gender: raw.gender ?? null,
      needsClarification: raw.needsClarification ?? null,
      reply: raw.reply ?? null,
    };
  } catch {
    return null;
  }
}

async function callGroq(prompt: string): Promise<ScoutDecision | null> {
  const key = process.env.GROQ_API_KEY?.trim();
  if (!key) return null;
  const model = process.env.GROQ_MODEL?.trim() || "openai/gpt-oss-120b";
  const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model,
      temperature: 0,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: prompt },
      ],
    }),
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) throw new Error(`groq ${response.status}: ${(await response.text()).slice(0, 200)}`);
  const json = await response.json();
  return parseJson(json?.choices?.[0]?.message?.content ?? "");
}

async function callGemini(prompt: string): Promise<ScoutDecision | null> {
  const key = process.env.GEMINI_API_KEY?.trim();
  if (!key) return null;
  const model = process.env.GEMINI_MODEL?.trim() || "gemini-2.5-flash";
  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      system_instruction: { parts: [{ text: SYSTEM_PROMPT }] },
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0, responseMimeType: "application/json" },
    }),
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) throw new Error(`gemini ${response.status}: ${(await response.text()).slice(0, 200)}`);
  const json = await response.json();
  return parseJson(json?.candidates?.[0]?.content?.parts?.map((p: { text?: string }) => p.text ?? "").join("") ?? "");
}

async function callOpenRouter(prompt: string): Promise<ScoutDecision | null> {
  const key = process.env.OPENROUTER_API_KEY?.trim();
  if (!key) return null;
  const model = process.env.OPENROUTER_MODEL?.trim() || "meta-llama/llama-3.3-70b-instruct:free";
  const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model,
      temperature: 0,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: prompt },
      ],
    }),
    signal: AbortSignal.timeout(20000),
  });
  if (!response.ok) throw new Error(`openrouter ${response.status}: ${(await response.text()).slice(0, 200)}`);
  const json = await response.json();
  return parseJson(json?.choices?.[0]?.message?.content ?? "");
}

export async function scoutQuery(text: string, history: string[]): Promise<ScoutDecision | null> {
  const prompt = history.length ? `История диалога (последние реплики пользователя):\n${history.join("\n")}\n\nНовое сообщение:\n${text}` : `Новое сообщение:\n${text}`;
  const calls: Array<(prompt: string) => Promise<ScoutDecision | null>> = [callGroq, callGemini, callOpenRouter];
  for (const call of calls) {
    try {
      const decision = await call(prompt);
      if (decision) return decision;
    } catch (error) {
      console.warn(`[scout] ${String(error).slice(0, 200)}`);
    }
  }
  return null;
}
