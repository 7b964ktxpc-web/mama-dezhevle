import type { Product } from "./types";
import type { DealResult } from "./deal-score";

const DEFAULT_MODEL = "gemini-3.5-flash-lite";
const API_BASE = "https://generativelanguage.googleapis.com/v1beta/models";
const REQUEST_TIMEOUT_MS = 20_000;

export type AiDealReview = {
  approved: boolean;
  qualityScore: number;
  reason: string;
  suggestedAngle: string;
};

function getEnv(name: string) {
  return process.env[name]?.trim() || "";
}

function clampScore(value: unknown) {
  const score = Number(value);
  if (!Number.isFinite(score)) return 0;
  return Math.max(0, Math.min(100, Math.round(score)));
}

function parseReview(text: string): AiDealReview {
  const cleaned = text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
  const parsed = JSON.parse(cleaned) as Partial<AiDealReview>;
  const qualityScore = clampScore(parsed.qualityScore);
  return {
    approved: Boolean(parsed.approved) && qualityScore >= 60,
    qualityScore,
    reason: typeof parsed.reason === "string" ? parsed.reason.slice(0, 300) : "AI не дал объяснение",
    suggestedAngle:
      typeof parsed.suggestedAngle === "string" ? parsed.suggestedAngle.slice(0, 300) : "Выгодная покупка для семьи",
  };
}

/**
 * AI is a second-stage quality gate. It must never invent price, discount or availability.
 * If the provider is not configured or fails, deterministic scoring remains the source of truth.
 */
export async function reviewDealWithAi(product: Product, deal: DealResult): Promise<AiDealReview | null> {
  const apiKey = getEnv("GEMINI_API_KEY");
  if (!apiKey) return null;

  const model = getEnv("GEMINI_MODEL") || DEFAULT_MODEL;
  const prompt = [
    "Ты редактор сервиса «Мама, дешевле!». Оцени качество уже рассчитанной сделки.",
    "Нельзя придумывать или менять цену, скидку, наличие, рейтинг или ссылку.",
    "Верни только JSON: {approved:boolean, qualityScore:number, reason:string, suggestedAngle:string}.",
    "approved=true только если предложение действительно полезно покупателю.",
    `Товар: ${product.title}`,
    `Категория: ${product.category ?? "не указана"}`,
    `Возраст: ${product.ageLabel ?? "не указан"}`,
    `Текущая цена: ${product.price}`,
    `Старая цена: ${product.oldPrice ?? "нет данных"}`,
    `Рейтинг: ${product.rating ?? "нет данных"}`,
    `Отзывы: ${product.reviewsCount ?? "нет данных"}`,
    `Наличие: ${product.available ? "да" : "нет"}`,
    `Deterministic score: ${deal.score}/100`,
    `Уровень: ${deal.level}`,
    `Реальная скидка: ${deal.realDiscountPercent}%`,
    `Причины: ${deal.reasons.join("; ")}`,
  ].join("\n");

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
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
    const payload = (await response.json()) as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    };
    const text = payload.candidates?.[0]?.content?.parts?.map((part) => part.text ?? "").join("").trim();
    if (!text) return null;
    return parseReview(text);
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}
