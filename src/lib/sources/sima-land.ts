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

function env(name: string): string | undefined {
  const value = process.env[name]?.trim();
  return value || undefined;
}

function pages(): number[] {
  const raw = env("SIMA_LAND_PAGES") ?? "1";
  return raw
    .split(/[\n,]/)
    .map((value) => Number(value.trim()))
    .filter((value) => Number.isInteger(value) && value > 0)
    .slice(0, 20);
}

function itemIds(): string[] {
  return (env("SIMA_LAND_ITEM_IDS") ?? "")
    .split(/[\n,]/)
    .map((value) => value.trim())
    .filter((value) => /^\d+$/.test(value));
}

function babyOnly(): boolean {
  return env("SIMA_LAND_BABY_ONLY") !== "false";
}

function isBabyProduct(item: SimaItem): boolean {
  if (!babyOnly()) return true;
  const title = (item.name ?? "").toLowerCase();
  const keywords = [
    "детск", "ребен", "малыш", "малыш", "игруш", "пазл", "кукл", "конструктор",
    "погремуш", "коляск", "горшок", "соска", "бутылоч", "подгуз", "пелен",
    "школь", "канцтовар", "раскраск", "творчеств", "рюкзак", "обувь дет",
    "одежд дет", "костюм дет", "бод", "комбинезон", "пижам", "песочн",
  ];
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

  const available = typeof item.balance === "number"
    ? item.balance > 0
    : Boolean(item.balance && !/нет|0\s*шт/i.test(String(item.balance)));
  const oldPrice = Number(item.price_max);

  return {
    externalId: String(item.sid ?? id),
    source: "sima-land",
    url: `https://www.sima-land.ru/${item.slug ? `${item.slug}/` : ""}${id}/`,
    title,
    category: "Детские товары",
    imageUrl: photoUrl(item),
    price,
    oldPrice: Number.isFinite(oldPrice) && oldPrice > price ? oldPrice : null,
    available,
  };
}

async function request(path: string): Promise<SimaItem[]> {
  const apiKey = env("SIMA_LAND_API_KEY");
  if (!apiKey) throw new Error("Sima-land API is not configured: missing SIMA_LAND_API_KEY");

  const response = await fetch(`${API_BASE}${path}`, {
    headers: { "x-api-key": apiKey, Accept: "application/json" },
  });
  const body = (await response.json()) as unknown;
  if (!response.ok) throw new Error(`Sima-land API ${response.status}: ${JSON.stringify(body)}`);
  if (!Array.isArray(body)) throw new Error("Sima-land API returned an unexpected catalog response");
  return body as SimaItem[];
}

export const simaLandSource: ProductSource = {
  id: "sima-land",
  name: "Сима-ленд (API v5)",
  isEnabled: () => Boolean(env("SIMA_LAND_API_KEY")),
  collect: async () => {
    const ids = itemIds();
    const rawItems = ids.length
      ? (await Promise.all(ids.map((id) => request(`/${id}/?by_sid=true`)))).flat()
      : (await Promise.all(pages().map((page) => request(`?p=${page}`)))).flat();

    return rawItems.map(toProduct).filter((product): product is Product => product !== null);
  },
};
