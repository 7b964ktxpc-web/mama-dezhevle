import { getDemoProducts } from "../lib/sources/demo";
import { calculateDealScore } from "../lib/deal-score";

const products = getDemoProducts();

for (const product of products) {
  const referencePrice = product.oldPrice ?? product.price;
  const deal = calculateDealScore({
    currentPrice: product.price,
    referencePrice,
    rating: product.rating,
    reviewsCount: product.reviewsCount,
    available: product.available,
  });

  console.log(JSON.stringify({ product, deal }, null, 2));
}

console.log(`Processed ${products.length} products.`);
