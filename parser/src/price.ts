import type { ParsedProduct } from "./types";
import type { ProductGroup } from "./matching";

export interface PriceAnalysis {
  current: number;
  reference?: number;
  minimum: number;
  maximum: number;
  median: number;
  savingsVsMax: number;
  savingsPercentVsMax: number;
  spreadPercent: number;
  dealScore: number;
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

export function analyzePrices(group: ProductGroup): PriceAnalysis {
  const prices = group.offers.map((offer) => offer.price).filter((price) => Number.isFinite(price) && price > 0);
  const current = Math.min(...prices);
  const minimum = current;
  const maximum = Math.max(...prices);
  const med = median(prices);
  const reference = group.offers.find((offer) => offer.price === current)?.oldPrice;
  const savingsVsMax = Math.max(0, maximum - current);
  const savingsPercentVsMax = maximum ? (savingsVsMax / maximum) * 100 : 0;
  const spreadPercent = med ? ((maximum - minimum) / med) * 100 : 0;

  // Conservative score: large cross-store differences help, but an isolated oldPrice
  // is not treated as proof of a genuine discount. Historical price snapshots can be
  // fed into this function later without changing its public output shape.
  const competitive = Math.min(55, savingsPercentVsMax * 2.2);
  const referenceSignal = reference && reference > current ? Math.min(25, ((reference - current) / reference) * 100 * 0.9) : 0;
  const marketDepth = Math.min(20, Math.max(0, group.offers.length - 1) * 5);

  return {
    current,
    reference,
    minimum,
    maximum,
    median: med,
    savingsVsMax,
    savingsPercentVsMax,
    spreadPercent,
    dealScore: Math.round(Math.min(100, competitive + referenceSignal + marketDepth)),
  };
}

export function cheapestOffer(group: ProductGroup): ParsedProduct {
  return group.offers.reduce((best, offer) => offer.price < best.price ? offer : best);
}
