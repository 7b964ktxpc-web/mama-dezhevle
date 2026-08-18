import type { ParsedProduct } from "./types";

export interface NormalizedProduct extends ParsedProduct {
  normalizedTitle: string;
  normalizedBrand?: string;
  packCount?: number;
  weightGrams?: number;
  volumeMl?: number;
  sizeLabel?: string;
  unitPrice?: number;
  unitBasis?: "item" | "kg" | "100g" | "l" | "100ml";
}

const NOISE_WORDS = new Set(["купить", "доставка", "скидка", "цена", "руб", "рублей", "упаковка"]);

export function normalizeTitle(value: string): string {
  return value.toLowerCase().replace(/ё/g, "е").replace(/&amp;/g, " ").replace(/[^a-zа-я0-9%.,/-]+/gi, " ").replace(/\s+/g, " ").trim()
    .split(" ").filter((word) => !NOISE_WORDS.has(word)).join(" ");
}

export function normalizeProduct(product: ParsedProduct): NormalizedProduct {
  const raw = product.title.toLowerCase().replace(/ё/g, "е");
  const packMatch = raw.match(/(?:^|\s)(\d+)\s*(?:шт|штук)(?:\s|$)/i);
  const title = normalizeTitle(product.title);
  const weightMatch = title.match(/(?:^|\s)(\d+(?:[.,]\d+)?)\s*(кг|kg|г|гр|g)(?:\s|$)/i);
  const volumeMatch = title.match(/(?:^|\s)(\d+(?:[.,]\d+)?)\s*(л|l|мл|ml)(?:\s|$)/i);
  const sizeMatch = title.match(/(?:размер|size)\s*([0-9a-zа-я+-]+)/i);

  let weightGrams: number | undefined;
  if (weightMatch) {
    const value = Number(weightMatch[1].replace(",", "."));
    weightGrams = /кг|kg/i.test(weightMatch[2]) ? value * 1000 : value;
  }

  let volumeMl: number | undefined;
  if (volumeMatch) {
    const value = Number(volumeMatch[1].replace(",", "."));
    volumeMl = /л|l/i.test(volumeMatch[2]) ? value * 1000 : value;
  }

  let unitPrice: number | undefined;
  let unitBasis: NormalizedProduct["unitBasis"];
  if (packMatch && Number(packMatch[1]) > 0) {
    unitPrice = product.price / Number(packMatch[1]);
    unitBasis = "item";
  } else if (weightGrams && weightGrams > 0) {
    unitPrice = product.price / (weightGrams / 1000);
    unitBasis = "kg";
  } else if (volumeMl && volumeMl > 0) {
    unitPrice = product.price / (volumeMl / 1000);
    unitBasis = "l";
  }

  return {
    ...product,
    normalizedTitle: title,
    normalizedBrand: product.brand ? normalizeTitle(product.brand) : undefined,
    packCount: packMatch ? Number(packMatch[1]) : undefined,
    weightGrams,
    volumeMl,
    sizeLabel: sizeMatch?.[1],
    unitPrice: unitPrice !== undefined ? Number(unitPrice.toFixed(2)) : undefined,
    unitBasis,
  };
}

export function normalizeProducts(products: ParsedProduct[]): NormalizedProduct[] {
  return products.map(normalizeProduct);
}
