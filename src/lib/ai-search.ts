import type { SearchResult } from "./product-search";

const API_BASE = "https://generativelanguage.googleapis.com/v1beta/models";
const DEFAULT_MODEL = "gemini-3.5-flash-lite";
const REQUEST_TIMEOUT_MS = 25_000;

function getEnv(name: string) {
  return process.env[name]?.trim() || "";
}

function apiKey() {
  return getEnv("GEMINI_API_KEY") || getEnv("AI_API_KEY");
}

function clampNumber(value: unknown) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

/**
 * AI-powered product search. Uses Gemini with the Google Search grounding tool
 * so the model fetches real, current offers from Russian marketplaces and returns
 * them as structured results. This is the "ИИ ищет" path — it never invents prices
 * or links, only what the live search actually found.
 */
export async function searchProductsWithAi(query: string, limit = 8): Promise<SearchResult[]> {
  const key = apiKey();
  if (!key) return [];
  const model = getEnv("GEMINI_MODEL") || getEnv("AI_MODEL") || DEFAULT_MODEL;

  const prompt = [
    "Ты — поисковик выгодных детских товаров в российских магазинах (Ozon, Wildberries, Детский мир, Яндекс Маркет).",
    "По запросу пользователя найди реальные дешёвые товары, используя поиск в интернете (Google Search).",
    "Верни ТОЛЬКО JSON-массив объектов без лишнего текста:",
    '[{ "title": string, "price": number (в рублях), "oldPrice": number | null, "url": string (прямая ссылка на товар), "source": string (название магазина) }].',
    "Не выдумывай ссылки и цены — используй только то, что реально нашёл через поиск.",
    `Максимум ${limit} товаров, отсортированных по цене по возрастанию.`,
    `Запрос пользователя: ${query}`,
  ].join("\n");

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(
      `${API_BASE}/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(key)}`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          contents: [{ role: "user", parts: [{ text: prompt }] }],
          tools: [{ googleSearch: {} }],
          generationConfig: { responseMimeType: "application/json", temperature: 0.2 },
        }),
        signal: controller.signal,
      }
    );
    if (!response.ok) return [];
    const payload = (await response.json()) as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    };
    const text = payload.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("").trim();
    if (!text) return [];

    const cleaned = text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
    const parsed = JSON.parse(cleaned) as Array<Record<string, unknown>>;
    if (!Array.isArray(parsed)) return [];

    return parsed
      .map((item): SearchResult => {
        const price = clampNumber(item.price);
        const old = item.oldPrice == null ? null : clampNumber(item.oldPrice);
        return {
          id: `ai-${Math.random().toString(36).slice(2, 10)}`,
          title: String(item.title ?? "Товар"),
          price,
          oldPrice: old && old > price ? old : null,
          rating: null,
          url: String(item.url ?? ""),
          source: item.source ? String(item.source) : "web",
          verified: Boolean(item.url),
          verificationStatus: "ai-search",
        };
      })
      .filter((r) => r.price > 0 && r.url)
      .slice(0, limit);
  } catch {
    return [];
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Same idea as the Gemini path, but via OpenAI's Responses API with the built-in
 * web_search tool. Uses OPENAI_API_KEY (already required for photo search here),
 * so if that key is present the bot can let the AI browse and return real offers.
 */
export async function searchOpenAiWeb(query: string, limit = 8): Promise<SearchResult[]> {
  const key = getEnv("OPENAI_API_KEY");
  if (!key) return [];
  const model = getEnv("OPENAI_MODEL") || "gpt-4o-mini";

  const prompt = [
    "Ты — поисковик выгодных детских товаров в российских магазинах (Ozon, Wildberries, Детский мир, Яндекс Маркет).",
    "По запросу пользователя найди реальные дешёвые товары, используя веб-поиск.",
    "Верни ТОЛЬКО JSON-массив объектов без лишнего текста:",
    '[{ "title": string, "price": number (в рублях), "oldPrice": number | null, "url": string (прямая ссылка на товар), "source": string (название магазина) }].',
    "Не выдумывай ссылки и цены — используй только то, что реально нашёл.",
    `Максимум ${limit} товаров, отсортированных по цене по возрастанию.`,
    `Запрос пользователя: ${query}`,
  ].join("\n");

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "content-type": "application/json" },
      body: JSON.stringify({
        model,
        tools: [{ type: "web_search_preview", web_search_options: { search_context_size: "medium" } }],
        input: prompt,
      }),
      signal: controller.signal,
    });
    if (!response.ok) return [];
    const payload = (await response.json()) as {
      output?: Array<{ content?: Array<{ type?: string; text?: string }> }>;
    };
    const text = (payload.output ?? [])
      .flatMap((o) => o.content ?? [])
      .filter((c) => c.type === "output_text" || c.text)
      .map((c) => c.text ?? "")
      .join("")
      .trim();
    if (!text) return [];

    const cleaned = text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
    const parsed = JSON.parse(cleaned) as Array<Record<string, unknown>>;
    if (!Array.isArray(parsed)) return [];

    return parsed
      .map((item): SearchResult => {
        const price = clampNumber(item.price);
        const old = item.oldPrice == null ? null : clampNumber(item.oldPrice);
        return {
          id: `ai-${Math.random().toString(36).slice(2, 10)}`,
          title: String(item.title ?? "Товар"),
          price,
          oldPrice: old && old > price ? old : null,
          rating: null,
          url: String(item.url ?? ""),
          source: item.source ? String(item.source) : "web",
          verified: Boolean(item.url),
          verificationStatus: "ai-search",
        };
      })
      .filter((r) => r.price > 0 && r.url)
      .slice(0, limit);
  } catch {
    return [];
  } finally {
    clearTimeout(timer);
  }
}
