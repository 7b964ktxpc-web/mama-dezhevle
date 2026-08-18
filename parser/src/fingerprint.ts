import type { ParsedProduct } from "./types";
import { normalizeTitle } from "./normalize";

export interface ProductFingerprint {
  key: string;
  brand?: string;
  model?: string;
  size?: string;
  quantity?: string;
  variant?: string;
}

function firstModel(title: string): string | undefined {
  return title.match(/\b(?:[a-z]{1,10}[ -]?)?\d{2,}[a-z0-9-]*\b/i)?.[0];
}

export function fingerprint(product: Pick<ParsedProduct, "title" | "brand">): ProductFingerprint {
  const title = normalizeTitle(product.title);
  const brand = product.brand ? normalizeTitle(product.brand) : undefined;
  const size = title.match(/(?:размер|size)\s*([a-zа-я0-9+-]+)/i)?.[1];
  const quantity = title.match(/\b(\d+)\s*(шт|штук)\b/i)?.[1];
  const model = firstModel(title);
  const variant = title.match(/\b(цвет|color)\s*[:#-]?\s*([a-zа-я0-9 -]+)/i)?.[2]?.trim();
  const key = [brand, model, size, quantity, variant].filter(Boolean).join("|") || title;
  return { key, brand, model, size, quantity, variant };
}

export function fingerprintProducts(products: ParsedProduct[]): Map<string, ParsedProduct[]> {
  const groups = new Map<string, ParsedProduct[]>();
  for (const product of products) {
    const key = fingerprint(product).key;
    const group = groups.get(key) ?? [];
    group.push(product);
    groups.set(key, group);
  }
  return groups;
}
