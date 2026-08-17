import { calculateDealScore } from "../lib/deal-score";

// Local smoke-test for the deterministic engine.
// Real collection/storage will be connected in the next step.
const demo = calculateDealScore({
  currentPrice: 2490,
  referencePrice: 3990,
  average30d: 3590,
  min30d: 2390,
  rating: 4.8,
  reviewsCount: 2841,
  available: true,
});

console.log(JSON.stringify(demo, null, 2));
