import type { DealResult } from "./deal-score";
import { trackedUrlFor } from "./affiliate";

type ProductForPost = {
  id?: string | number;
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

function naturalIntro(product: ProductForPost, deal: DealResult) {
  const discount = Number(deal.realDiscountPercent);
  const saving = Number(deal.savingAmount);
  const reviews = Number(product.reviewsCount ?? 0);

  if (discount >= 50) return `Вот это уже интересно 👀 На ${product.title} цена заметно просела — сейчас ${rubles.format(product.currentPrice)} ₽.`;
  if (saving >= 1000) return `Нашла вариант, где можно нормально сэкономить: ${product.title} сейчас стоит ${rubles.format(product.currentPrice)} ₽.`;
  if (reviews >= 500 && Number(product.rating ?? 0) >= 4.8) return `Поймала хороший вариант для детей 👀 У ${product.title} много отзывов и сейчас цена выглядит действительно интересно.`;
  if (product.ageLabel) return `Если как раз ищете что-то для детей ${product.ageLabel}, посмотрите этот вариант: ${product.title}. Цена сейчас ${rubles.format(product.currentPrice)} ₽.`;
  return `Кажется, на этот товар сейчас действительно удачно снизили цену: ${product.title}.`;
}

export function buildDealPost(product: ProductForPost, deal: DealResult) {
  const saving = rubles.format(deal.savingAmount);
  const current = rubles.format(product.currentPrice);
  const reference = rubles.format(product.referencePrice);
  const source = product.source === "detmir" ? "Детский мир" : product.source ?? "магазин";
  const intro = naturalIntro(product, deal);

  const lines = [
    intro,
    "",
    `🧸 ${product.title}`,
    "",
    `Было: ${reference} ₽ → сейчас **${current} ₽**`,
    `💰 Экономия — **${saving} ₽** (${deal.realDiscountPercent}%)`,
  ];

  if (product.rating != null) lines.push(`⭐ Рейтинг ${product.rating}${product.reviewsCount ? ` · ${product.reviewsCount.toLocaleString("ru-RU")} отзывов` : ""}`);
  if (product.ageLabel) lines.push(`👶 Подойдёт: ${product.ageLabel}`);
  if (deal.reasons[0]) lines.push(`💬 Почему взяли в подборку: ${deal.reasons[0]}`);

  const link = trackedUrlFor(product.id, product.source, product.url);
  lines.push("", `🏪 ${source}`, `👉 [Посмотреть товар](${link})`);
  return lines.join("\n");
}
