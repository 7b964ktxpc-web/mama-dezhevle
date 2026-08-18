import type { MarketplaceAdapter, ParsedProduct, ParserOptions, Marketplace } from "./types";
import { extractProductsFromJsonLd } from "./extract";

const HOSTS: Record<Exclude<Marketplace, "unknown">, string[]> = {
  ozon: ["ozon.ru", "www.ozon.ru"],
  wildberries: ["wildberries.ru", "www.wildberries.ru"],
  "yandex-market": ["market.yandex.ru"],
  megamarket: ["megamarket.ru", "sbermegamarket.ru"],
  detmir: ["detmir.ru", "www.detmir.ru"],
};

function matchesHost(host: string, hosts: string[]): boolean {
  const normalized = host.toLowerCase().replace(/^www\./, "");
  return hosts.some((candidate) => normalized === candidate.replace(/^www\./, "") || normalized.endsWith(`.${candidate.replace(/^www\./, "")}`));
}

function fallbackMeta(html: string, marketplace: Marketplace, sourceUrl: string): ParsedProduct[] {
  const getMeta = (property: string) => {
    const pattern = new RegExp(`<meta[^>]+(?:property|name)=["']${property.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}["'][^>]+content=["']([^"']+)["'][^>]*>`, "i");
    return pattern.exec(html)?.[1];
  };
  const title = getMeta("og:title") ?? getMeta("twitter:title");
  const imageUrl = getMeta("og:image");
  const url = getMeta("og:url") ?? sourceUrl;
  const priceRaw = getMeta("product:price:amount");
  const price = priceRaw ? Number(priceRaw.replace(/\s/g, "").replace(",", ".")) : NaN;
  if (!title || !Number.isFinite(price) || price <= 0) return [];
  return [{ marketplace, externalId: url, title, url, price, currency: getMeta("product:price:currency") ?? "RUB", imageUrl, sourceUrl, collectedAt: new Date().toISOString() }];
}

function makeAdapter(id: Exclude<Marketplace, "unknown">): MarketplaceAdapter {
  return {
    id,
    matches(url: URL) { return matchesHost(url.hostname, HOSTS[id]); },
    parse(url: URL, html: string, _options: ParserOptions) {
      const structured = extractProductsFromJsonLd(html, id, url.toString());
      return structured.length ? structured : fallbackMeta(html, id, url.toString());
    },
  };
}

export const adapters: MarketplaceAdapter[] = [
  makeAdapter("ozon"),
  makeAdapter("wildberries"),
  makeAdapter("yandex-market"),
  makeAdapter("megamarket"),
  makeAdapter("detmir"),
];

export function adapterFor(url: URL): MarketplaceAdapter | undefined {
  return adapters.find((adapter) => adapter.matches(url));
}
