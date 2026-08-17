import type { Product } from "../types";

const DEFAULT_URL = "https://www.detmir.ru/page/sale-sale/";

/**
 * Public-source adapter boundary for Детский мир.
 *
 * The MVP intentionally does not bypass CAPTCHA, login, robots restrictions,
 * or anti-bot protection. The collector can be fed a permitted HTML snapshot
 * or a future official feed/endpoint without changing the Product model.
 */
export type DetmirListing = {
  externalId: string;
  title: string;
  url: string;
  price: number;
  oldPrice?: number | null;
  rating?: number | null;
  imageUrl?: string | null;
  category?: string | null;
  available?: boolean;
};

export function detmirSourceUrl() {
  return process.env.DETMIR_SOURCE_URL || DEFAULT_URL;
}

export function normalizeDetmirListings(listings: DetmirListing[]): Product[] {
  return listings
    .filter((item) => item.title && item.url && Number.isFinite(item.price) && item.price > 0)
    .map((item) => ({
      externalId: item.externalId,
      source: "detmir",
      url: item.url,
      title: item.title.trim(),
      category: item.category ?? "Детские товары",
      imageUrl: item.imageUrl ?? null,
      rating: item.rating ?? null,
      reviewsCount: null,
      price: item.price,
      oldPrice: item.oldPrice ?? null,
      available: item.available ?? true,
    }));
}

/**
 * Seed data from a currently public Детский мир page.
 * It is deliberately kept as a fixture until we have a permitted machine
 * readable feed/endpoint. This makes the pipeline testable without scraping.
 */
export function getDetmirFixture(): Product[] {
  return normalizeDetmirListings([
    {
      externalId: "fixture-manu-xl-54",
      title: "Трусики MANU ультратонкие XL (12-17 кг) 54 шт.",
      url: DEFAULT_URL,
      price: 1199,
      oldPrice: 2199,
      rating: 5,
      category: "Подгузники и трусики",
    },
    {
      externalId: "fixture-bazumi-magnetic-192",
      title: "Конструктор BAZUMI кубики майнкрафт магнитный 192 дет.",
      url: DEFAULT_URL,
      price: 2356,
      oldPrice: 3800,
      category: "Конструкторы",
    },
  ]);
}
