import { adapterFor } from "./adapters";
import type { ParsedProduct, ParserOptions } from "./types";

const DEFAULTS: Required<ParserOptions> = {
  timeoutMs: 15000,
  concurrency: 3,
  userAgent: "Mozilla/5.0 (compatible; MamaDezhevleParser/0.1; +https://mama-dezhevle.example)",
  maxProductsPerPage: 100,
};

export class MarketplaceParser {
  private readonly options: Required<ParserOptions>;

  constructor(options: ParserOptions = {}) {
    this.options = { ...DEFAULTS, ...options };
  }

  async parse(urls: string[]): Promise<ParsedProduct[]> {
    const results: ParsedProduct[] = [];
    let cursor = 0;
    const worker = async () => {
      while (cursor < urls.length) {
        const index = cursor++;
        try {
          const products = await this.parseUrl(urls[index]);
          results.push(...products.slice(0, this.options.maxProductsPerPage));
        } catch (error) {
          console.error(JSON.stringify({ url: urls[index], error: error instanceof Error ? error.message : String(error) }));
        }
      }
    };
    await Promise.all(Array.from({ length: Math.min(this.options.concurrency, Math.max(urls.length, 1)) }, worker));
    return dedupe(results);
  }

  async parseUrl(input: string): Promise<ParsedProduct[]> {
    const url = new URL(input);
    if (url.protocol !== "https:") throw new Error("Only HTTPS marketplace URLs are supported");
    const adapter = adapterFor(url);
    if (!adapter) throw new Error(`Unsupported marketplace host: ${url.hostname}`);

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.options.timeoutMs);
    try {
      const response = await fetch(url, {
        signal: controller.signal,
        cache: "no-store",
        headers: {
          "user-agent": this.options.userAgent,
          accept: "text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.8",
          "accept-language": "ru-RU,ru;q=0.9,en;q=0.7",
        },
      });
      if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
      const contentType = response.headers.get("content-type") ?? "";
      if (!contentType.includes("text/html") && !contentType.includes("application/xhtml+xml")) {
        throw new Error(`Unsupported response content-type: ${contentType}`);
      }
      const html = await response.text();
      return adapter.parse(url, html, this.options);
    } finally {
      clearTimeout(timer);
    }
  }
}

function dedupe(products: ParsedProduct[]): ParsedProduct[] {
  const map = new Map<string, ParsedProduct>();
  for (const product of products) {
    const key = `${product.marketplace}:${product.externalId}`;
    const existing = map.get(key);
    if (!existing || product.price < existing.price) map.set(key, product);
  }
  return [...map.values()];
}

export function comparePrices(products: ParsedProduct[]) {
  const groups = new Map<string, ParsedProduct[]>();
  for (const product of products) {
    const key = normalizeProductKey(product.title, product.brand);
    const group = groups.get(key) ?? [];
    group.push(product);
    groups.set(key, group);
  }

  return [...groups.entries()].map(([key, offers]) => {
    const sorted = [...offers].sort((a, b) => a.price - b.price);
    const cheapest = sorted[0];
    const highest = sorted[sorted.length - 1];
    return {
      key,
      title: cheapest.title,
      brand: cheapest.brand,
      offers: sorted,
      cheapest,
      savings: highest ? Math.max(0, highest.price - cheapest.price) : 0,
      marketplaceCount: new Set(sorted.map((item) => item.marketplace)).size,
    };
  });
}

function normalizeProductKey(title: string, brand?: string): string {
  return `${brand ?? ""} ${title}`
    .toLowerCase()
    .replace(/ё/g, "е")
    .replace(/[^a-zа-я0-9]+/gi, " ")
    .replace(/\b(купить|доставка|скидка|цена|руб|₽)\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}
