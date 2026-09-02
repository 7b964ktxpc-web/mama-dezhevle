import { calculateDealScore } from "./deal-score";
import type { ProductGroup } from "./product-matcher";

// Effective price = base price + mandatory costs known to us. Delivery and
// promo data is not returned by every source; when unknown we keep the field
// null and never invent a number (spec: no fake data).
export function effectivePrice(offer: { price: number; deliveryPrice?: number | null }): number {
  return Math.round(offer.price + (offer.deliveryPrice ?? 0));
}

function median(values: number[]): number {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

export function applyPriceEngine(groups: ProductGroup[]): void {
  for (const group of groups) {
    const prices = group.offers.map((o) => o.price).filter((p) => Number.isFinite(p) && p > 0);
    const marketMedian = median(prices);
    for (const offer of group.offers) {
      offer.effectivePrice = effectivePrice(offer);
      offer.discountPercent =
        offer.oldPrice && offer.oldPrice > offer.price
          ? Math.round((1 - offer.price / offer.oldPrice) * 100)
          : null;
      if (!Number.isFinite(offer.price) || offer.price <= 0) {
        offer.verified = false;
        offer.verificationStatus = "bad_price";
        continue;
      }
      if (marketMedian && offer.price < marketMedian * 0.2) {
        offer.verified = false;
        offer.verificationStatus = "price_anomaly";
        continue;
      }
      if (offer.availability === false) {
        offer.verified = false;
        offer.verificationStatus = "out_of_stock";
        continue;
      }
      offer.verified = true;
      offer.verificationStatus = "ok";
    }
    // Reference price for scoring: cross-source median is only meaningful with
    // several offers. For single-offer groups the strikethrough price is the
    // only honest reference; without it there is nothing to score against.
    const multi = group.offers.filter((o) => o.verified).length > 1;
    const reference = multi ? marketMedian || group.best.price : group.best.oldPrice && group.best.oldPrice > group.best.price ? group.best.oldPrice : group.best.price;
    for (const offer of group.offers) {
      if (!offer.verified) continue;
      const offerReference = multi
        ? Math.max(reference, offer.price)
        : offer.oldPrice && offer.oldPrice > offer.price
          ? offer.oldPrice
          : offer.price;
      const scored = calculateDealScore({
        currentPrice: offer.effectivePrice ?? offer.price,
        referencePrice: offerReference,
        rating: offer.rating ?? null,
        reviewsCount: offer.reviewsCount ?? null,
        available: offer.availability !== false,
      });
      offer.dealScore = scored.score;
    }
  }
  groups.sort((a, b) => {
    const av = a.best.verified ? a.best.effectivePrice ?? a.best.price : Number.MAX_SAFE_INTEGER;
    const bv = b.best.verified ? b.best.effectivePrice ?? b.best.price : Number.MAX_SAFE_INTEGER;
    return av - bv;
  });
}
