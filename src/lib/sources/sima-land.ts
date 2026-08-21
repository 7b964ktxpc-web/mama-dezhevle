import type { Product } from "../types";
import type { ProductSource } from "./source";

type SimaItem = {
  id?: number;
  sid?: number;
  name?: string;
  slug?: string;
  balance?: string | number | null;
  price?: number | string | null;
  price_max?: number | string | null;
  wholesale_price?: number | string | null;
  base_photo_url?: string | null;
  category_id?: number | null;
  is_adult?: boolean;
  is_markdown?: boolean;
};

const API_BASE = "https://www.sima-land.ru/api/v5/item";
const DEFAULT_TIMEOUT_MS = 20_000;
const DEFAULT_RETRIES = 2;

function env(name: string): string | undefined {
  const value = process.env[name]?.trim();
  return value || undefined;
}

function numberEnv(name: string, fallback: number): number {
  const value = Number(env(name));
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function pages(): number[] {
  const raw = env("SIMA_LAND_PAGES") ?? "1";
  return raw.split(/[\n,]/).map((value) => Number(value.trim())).filter((value) => Number.isInteger(value) && value > 0).slice(0, 20);
}

function itemIds(): string[] {
  return (env("SIMA_LAND_ITEM_IDS") ?? "").split(/[\n,]/).map((value) => value.trim()).filter((value) => /^\d+$/.test(value));
}

function babyOnly(): boolean {
  return env("SIMA_LAND_BABY_ONLY") !== "false";
}

function isBabyProduct(item: SimaItem): boolean {
  if (!babyOnly()) return true;
  const title = (item.name ?? "").toLowerCase();
  const keywords = ["детск", "ребен", "малыш", "игруш", "пазл", "кукл", "конструктор", "погремуш", "коляск", "горшок", "соска", "бутылоч", "подгуз", "пелен", "школь", "канцтовар", "раскраск", "творчеств", "рюкзак", "обувь дет", "одежд дет", "костюм дет", "бод", "комбинезон", "пижам", "песочн"];
  return keywords.some((keyword) => title.includes(keyword));
}

function photoUrl(item: SimaItem): string | null {
  const base = item.base_photo_url?.trim();
  if (!base || !item.id) return null;
  return `${base}${item.id}.jpg`;
}

function toProduct(item: SimaItem): Product | null {
  const id = item.id ?? item.sid;
  const title = item.name?.trim();
  const price = Number(item.price);
  if (!id || !title || !Number.isFinite(price) || price <= 0 || !isBabyProduct(item)) return null;
  const available = typeof item.balance === "number" ? item.balance > 0 : Boolean(item.balance && !/нет|0\s*шт/i.test(String(item.balance)));
  const oldPrice = Number(item.price_max);
  return { externalId: String(item.sid ?? id), source: "sima-land", url: `https://www.sima-land.ru/${item.slug ? `${item.slug}/` : ""}${id}/`, title, category: "Детские товары", imageUrl: photoUrl(item), price, oldPrice: Number.isFinite(oldPrice) && oldPrice > price ? oldPrice : null, available };
}

async function request(path: string): Promise<SimaItem[]> {
  const apiKey = env("SIMA_LAND_API_KEY");
  if (!apiKey) throw new Error("Sima-land API is not configured: missing SIMA_LAND_API_KEY");

  const timeoutMs = numberEnv("SIMA_LAND_TIMEOUT_MS", DEFAULT_TIMEOUT_MS);
  const retries = Math.min(5, Math.floor(numberEnv("SIMA_LAND_RETRIES", DEFAULT_RETRIES)));
  let lastError: unknown;

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(`${API_BASE}${path}`, {
        headers: { "x-api-key": apiKey, Accept: "application/json" },
        signal: controller.signal,
      });
      const body = (await response.json()) as unknown;
      if (!response.ok) throw new Error(`Sima-land API ${response.status}: ${JSON.stringify(body)}`);
      if (!Array.isArray(body)) throw new Error("Sima-land API returned an unexpected catalog response");
      return body as SimaItem[];
    } catch (error) {
      lastError = error instanceof Error && error.name === "AbortError"
        ? new Error(`Sima-land API request timed out after ${timeoutMs}ms: ${path}`)
        : error;
      if (attempt < retries) await new Promise((resolve) => setTimeout(resolve, 750 * (attempt + 1)));
    } finally {
      clearTimeout(timeout);
    }
  }

  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

async function collectIndependently(paths: string[]): Promise<SimaItem[]> {
  const results = await Promise.allSettled(paths.map((path) => request(path)));
  const items: SimaItem[] = [];
  const errors: string[] = [];

  results.forEach((result, index) => {
    if (result.status === "fulfilled") items.push(...result.value);
    else errors.push(`${paths[index]}: ${result.reason instanceof Error ? result.reason.message : String(result.reason)}`);
  });

  if (!items.length && errors.length) {
    throw new Error(`Sima-land collection failed: ${errors.join(" | ")}`);
  }
  if (errors.length) console.warn(JSON.stringify({ source: "sima-land", partialErrors: errors }));
  return items;
}

export const simaLandSource: ProductSource = {
  id: "sima-land",
  name: "Сима-ленд (API v5)",
  isEnabled: () => env("SIMA_LAND_ENABLED") === "true" && Boolean(env("SIMA_LAND_API_KEY")),
  collect: async () => {
    const ids = itemIds();
    const paths = ids.length
      ? ids.map((id) => `/${id}/?by_sid=true`)
      : pages().map((page) => `?p=${page}`);
    const rawItems = await collectIndependently(paths);
    return rawItems.map(toProduct).filter((product): product is Product => product !== null);
  },
};
