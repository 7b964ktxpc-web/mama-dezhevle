export type DealInput = {
  currentPrice: number;
  referencePrice: number;
  average30d?: number | null;
  min30d?: number | null;
  rating?: number | null;
  reviewsCount?: number | null;
  available?: boolean;
};

export type DealResult = {
  score: number;
  level: "super_deal" | "good_deal" | "interesting" | "reject";
  realDiscountPercent: number;
  savingAmount: number;
  reasons: string[];
};

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

/**
 * Deterministic first-pass scoring. No AI or paid API is required.
 * AI can be layered on top of this shortlist later.
 */
export function calculateDealScore(input: DealInput): DealResult {
  const { currentPrice, referencePrice, average30d, min30d, rating, reviewsCount, available = true } = input;

  if (!Number.isFinite(currentPrice) || currentPrice <= 0 || !Number.isFinite(referencePrice) || referencePrice <= 0) {
    return { score: 0, level: "reject", realDiscountPercent: 0, savingAmount: 0, reasons: ["Некорректная цена"] };
  }

  const savingAmount = Math.max(0, referencePrice - currentPrice);
  const realDiscountPercent = clamp((savingAmount / referencePrice) * 100, 0, 100);

  let score = 0;
  const reasons: string[] = [];

  // 40 points: current price vs historical average.
  if (average30d && average30d > 0) {
    const belowAverage = ((average30d - currentPrice) / average30d) * 100;
    score += clamp(belowAverage * 1.33, 0, 40);
    if (belowAverage >= 15) reasons.push(`цена ниже средней за 30 дней на ${Math.round(belowAverage)}%`);
  } else {
    score += clamp(realDiscountPercent * 0.8, 0, 32);
  }

  // 20 points: advertised/reference price reduction.
  score += clamp(realDiscountPercent * 0.5, 0, 20);

  // 15 points: rating.
  if (rating != null) score += clamp((rating / 5) * 15, 0, 15);

  // 10 points: review confidence.
  if (reviewsCount != null) {
    score += reviewsCount >= 1000 ? 10 : reviewsCount >= 100 ? 8 : reviewsCount >= 20 ? 5 : 1;
  }

  // 5 points: historical minimum proximity. Being very close to the 30d low is valuable.
  if (min30d && min30d > 0) {
    const distanceFromMin = ((currentPrice - min30d) / min30d) * 100;
    score += distanceFromMin <= 3 ? 5 : distanceFromMin <= 10 ? 3 : 0;
    if (distanceFromMin <= 3) reasons.push("цена близка к минимуму за 30 дней");
  }

  // 5 points: availability.
  if (available) score += 5;

  // 5 points: seller/product confidence represented by reviews + rating.
  if ((rating ?? 0) >= 4.7 && (reviewsCount ?? 0) >= 100) score += 5;

  score = Math.round(clamp(score, 0, 100));

  let level: DealResult["level"] = "reject";
  if (score >= 90) level = "super_deal";
  else if (score >= 80) level = "good_deal";
  else if (score >= 70) level = "interesting";

  if (!available) level = "reject";
  if ((reviewsCount ?? 0) < 10) level = "reject";

  return { score, level, realDiscountPercent: Math.round(realDiscountPercent), savingAmount, reasons };
}
