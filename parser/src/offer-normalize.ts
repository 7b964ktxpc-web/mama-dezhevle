export interface RawOffer { price?: number | string; oldPrice?: number | string; availability?: string | boolean; }

const toNumber = (value: number | string | undefined): number | undefined => {
  if (typeof value === "number") return Number.isFinite(value) && value > 0 ? value : undefined;
  if (typeof value !== "string") return undefined;
  const n = Number(value.replace(/\u00a0/g, " ").replace(/\s/g, "").replace(/,/g, "."));
  return Number.isFinite(n) && n > 0 ? n : undefined;
};

export function normalizeOffer(offer: RawOffer) {
  const price = toNumber(offer.price);
  const old = toNumber(offer.oldPrice);
  const oldPrice = old !== undefined && price !== undefined && old > price ? old : undefined;
  const discountPercent = oldPrice && price ? Math.round((1 - price / oldPrice) * 100) : undefined;
  const availability = typeof offer.availability === "boolean" ? offer.availability : offer.availability === undefined ? undefined : !/out|нет\s+в\s+наличии|sold\s*out|unavailable/i.test(offer.availability);
  return { price, oldPrice, discountPercent, availability };
}
