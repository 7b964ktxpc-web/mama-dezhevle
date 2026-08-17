import type { DealResult } from "./deal-score";

type ProductForPost = {
  title: string;
  currentPrice: number;
  referencePrice: number;
  rating?: number | null;
  reviewsCount?: number | null;
  ageLabel?: string | null;
  url: string;
  source?: string | null;
};

const rubles = new Intl.NumberFormat("ru-RU");

export function buildDealPost(product: ProductForPost, deal: DealResult) {
  const headline = deal.level === "super_deal" ? "🔥 РЕАЛЬНО ВЫГОДНО" : "🟢 ХОРОШАЯ СКИДКА";
  const saving = rubles.format(deal.savingAmount);
  const current = rubles.format(product.currentPrice);
  const reference = rubles.format(product.referencePrice);
  const source = product.source === "detmir" ? "Детский мир" : product.source ?? "магазин";

  const lines = [
    headline,
    "",
    `🧸 ${product.title}`,
    "",
    `~~${reference} ₽~~ → **${current} ₽**`,
    `💰 Экономия: **${saving} ₽**`,
    `📉 Реальное снижение: **${deal.realDiscountPercent}%**`,
  ];

  if (product.rating != null) lines.push(`⭐ ${product.rating}${product.reviewsCount ? ` · ${product.reviewsCount.toLocaleString("ru-RU")} отзывов` : ""}`);
  if (product.ageLabel) lines.push(`👶 Возраст: ${product.ageLabel}`);
  if (deal.reasons[0]) lines.push(`📊 ${deal.reasons[0]}`);

  lines.push(`🏪 Источник: ${source}`, "", `🛒 [Посмотреть товар](${product.url})`);
  return lines.join("\n");
}
