import type { Offer } from "./kettu-gateway";

export type ProductGroup = {
  key: string;
  title: string;
  brand: string | null;
  offers: Offer[];
  best: Offer;
  medianPrice: number;
};

export function normalizeTitle(text: string): string {
  return text
    .toLowerCase()
    .replace(/ё/g, "е")
    .replace(/[^a-zа-я0-9]+/g, " ")
    .trim();
}

// Strong identity signals only: a 4+ digit model/SKU number (LEGO 42171,
// Samsung EB-BA5R5RUEG style alnum codes). Never merge on fuzzy titles alone.
export function extractModel(title: string): string | null {
  const normalized = normalizeTitle(title);
  const alnum = normalized.match(/\b[a-z]{1,4}-?\d{4,}\b/);
  if (alnum) return alnum[0].replace(/-/g, "");
  const digits = normalized.match(/\b\d{4,6}\b/);
  return digits ? digits[0] : null;
}

function offerKey(offer: Offer): string {
  const model = extractModel(offer.title);
  if (model) return `m:${model}`;
  const tokens = normalizeTitle(offer.title).split(" ").slice(0, 8).join(" ");
  return `t:${tokens}`;
}

// Within one model-number bucket, split only when two offers carry different
// non-empty brands. A missing brand never blocks a merge (unknown != conflict).
function splitByBrandConflict(offers: Offer[]): Offer[][] {
  const brands = new Set(offers.map((o) => (o.brand ? normalizeTitle(o.brand) : "")).filter(Boolean));
  if (brands.size <= 1) return [offers];
  const groups = new Map<string, Offer[]>();
  for (const offer of offers) {
    const brand = offer.brand ? normalizeTitle(offer.brand) : "";
    const bucket = groups.get(brand);
    if (bucket) bucket.push(offer);
    else groups.set(brand, [offer]);
  }
  const noBrand = groups.get("");
  groups.delete("");
  const parts = [...groups.values()];
  if (noBrand?.length) {
    const largest = parts.reduce((a, b) => (a.length >= b.length ? a : b), parts[0] ?? []);
    largest.push(...noBrand);
  }
  return parts.length ? parts : [offers];
}

function median(values: number[]): number {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

export function groupOffers(offers: Offer[]): ProductGroup[] {
  const bucketsByKey = new Map<string, Offer[]>();
  for (const offer of offers) {
    const key = offerKey(offer);
    const bucket = bucketsByKey.get(key);
    if (bucket) bucket.push(offer);
    else bucketsByKey.set(key, [offer]);
  }
  const groups: ProductGroup[] = [];
  for (const [key, bucket] of bucketsByKey) {
    const parts = key.startsWith("m:") ? splitByBrandConflict(bucket) : [bucket];
    parts.forEach((part, partIndex) => {
      const offers2 = [...part].sort((a, b) => a.price - b.price);
      const best = offers2.find((o) => o.availability !== false) ?? offers2[0];
      groups.push({
        key: parts.length > 1 ? `${key}#${partIndex}` : key,
        title: best.title,
        brand: best.brand ?? null,
        offers: offers2,
        best,
        medianPrice: median(offers2.map((o) => o.price)),
      });
    });
  }
  groups.sort((a, b) => a.best.price - b.best.price);
  return groups;
}
