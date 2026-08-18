import type { MarketplaceAdapter, ParsedProduct, ParserOptions, Marketplace } from "./types";
import { extractProducts } from "./product-extractor";

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

function makeAdapter(id: Exclude<Marketplace, "unknown">): MarketplaceAdapter {
  return {
    id,
    matches(url: URL) { return matchesHost(url.hostname, HOSTS[id]); },
    parse(url: URL, html: string, _options: ParserOptions) {
      return extractProducts(html, url.toString())
        .filter((item): item is typeof item & { title: string; price: number } => Boolean(item.title && item.price !== undefined))
        .map((item, index) => ({
          marketplace: id,
          externalId: item.url ?? `${id}:extracted-${index}`,
          title: item.title,
          url: item.url ?? url.toString(),
          price: item.price,
          currency: item.currency ?? "RUB",
          brand: item.brand,
          sourceUrl: url.toString(),
          collectedAt: new Date().toISOString(),
        }));
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
