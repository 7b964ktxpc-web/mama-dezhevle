import { calculateDealScore } from "../lib/deal-score";
import { reviewDealWithAi } from "../lib/ai";
import type { Product } from "../lib/types";

// Local smoke-test for the deterministic engine plus the optional AI quality gate.
const product: Product = {
  externalId: "demo-1",
  source: "detmir",
  url: "https://example.com/product/demo-1",
  title: "Детский набор для творчества",
  category: "творчество",
  ageLabel: "3+",
  price: 2490,
  oldPrice: 3990,
  rating: 4.8,
  reviewsCount: 2841,
  available: true,
};

const deal = calculateDealScore({
  currentPrice: product.price,
  referencePrice: product.oldPrice ?? product.price,
  average30d: 3590,
  min30d: 2390,
  rating: product.rating,
  reviewsCount: product.reviewsCount,
  available: product.available,
});

const ai = await reviewDealWithAi(product, deal);
console.log(JSON.stringify({ deal, ai, aiConfigured: Boolean(process.env.GEMINI_API_KEY) }, null, 2));
