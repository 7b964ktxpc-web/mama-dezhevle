import { XMLParser } from "fast-xml-parser";
import type { Product } from "../types";

export type ParsedFeed = {
  source: string;
  products: Product[];
};

function asArray<T>(value: T | T[] | undefined): T[] {
  if (value === undefined) return [];
  return Array.isArray(value) ? value : [value];
}

function text(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "string" || typeof value === "number") return String(value).trim();
  if (typeof value === "object" && "#text" in value) return String((value as { "#text": unknown })["#text"]).trim();
  return null;
}

function number(value: unknown): number | null {
  const parsed = Number(text(value));
  return Number.isFinite(parsed) ? parsed : null;
}

function params(offer: Record<string, unknown>): Record<string, string> {
  const result: Record<string, string> = {};
  for (const param of asArray(offer.param as Record<string, unknown> | Record<string, unknown>[] | undefined)) {
    const name = typeof param?.["@_name"] === "string" ? param["@_name"] : null;
    const value = text(param);
    if (name && value) result[name.toLowerCase()] = value;
  }
  return result;
}

export function parseYmlFeed(xml: string, source: string): ParsedFeed {
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: "@_",
    trimValues: true,
    isArray: (name) => name === "offer" || name === "param",
  });

  const root = parser.parse(xml) as Record<string, unknown>;
  const catalog = root.yml_catalog as Record<string, unknown> | undefined;
  const shop = catalog?.shop as Record<string, unknown> | undefined;
  const offers = shop?.offers as Record<string, unknown> | undefined;

  if (!offers) return { source, products: [] };

  const products: Product[] = [];
  const feedOffers = asArray(offers.offer as Record<string, unknown> | Record<string, unknown>[] | undefined);
  for (const offer of feedOffers) {
    const externalId = text(offer["@_id"]);
    const url = text(offer.url);
    const title = text(offer.name);
    const price = number(offer.price);
    if (!externalId || !url || !title || price === null) continue;

    const attributes = params(offer);
    const oldPrice = number(offer.oldprice);
    const rating = number(offer.rating);
    const reviewsCount = number(offer.reviewscount);

    products.push({
      externalId,
      source,
      url,
      title,
      brand: text(offer.vendor),
      category: text(offer.categoryId),
      ageLabel: attributes["возраст"] ?? attributes["age"] ?? null,
      imageUrl: text(offer.picture),
      rating,
      reviewsCount,
      price,
      oldPrice: oldPrice !== null && oldPrice > price ? oldPrice : null,
      available: String(offer["@_available"] ?? "true").toLowerCase() !== "false",
    });
  }

  return { source, products };
}

export async function loadYmlFeed(url: string, source: string): Promise<ParsedFeed> {
  const response = await fetch(url, { headers: { accept: "application/xml,text/xml,*/*" } });
  if (!response.ok) throw new Error(`Feed request failed: ${response.status} ${response.statusText}`);
  return parseYmlFeed(await response.text(), source);
}
