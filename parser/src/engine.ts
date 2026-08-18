import { adapterFor } from "./adapters";
import { fetchPublicPage } from "./http";
import { checkRobots } from "./robots";
import type { ParsedProduct, ParserOptions } from "./types";

const DEFAULTS: Required<ParserOptions> = {
  timeoutMs: 15000,
  concurrency: 3,
  userAgent: "Mozilla/5.0 (compatible; MamaDezhevleParser/0.1)",
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

    const robots = await checkRobots(url, this.options.userAgent);
    if (!robots.allowed) throw new Error(`Blocked by robots.txt rule: ${robots.matchedRule}`);

    const result = await fetchPublicPage(url, {
      timeoutMs: this.options.timeoutMs,
      retries: 2,
      baseDelayMs: 400,
      userAgent: this.options.userAgent,
    });
    return adapter.parse(url, result.html, this.options);
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
    const key = `${product.brand ?? ""} ${product.title}`.toLowerCase().replace(/ё/g, "е").replace(/[^a-zа-я0-9]+/gi, " ").replace(/\s+/g, " ").trim();
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
