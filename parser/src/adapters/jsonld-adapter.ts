import type { ParsedProduct, ParserOptions } from "../types";
import { parseProductJsonLd } from "../fixtures/parse-fixture";
import { fixtureToParsedProduct } from "../fixtures/to-parsed-product";

export interface JsonLdAdapter {
  marketplace: string;
  supports(hostname: string): boolean;
  parse(url: URL, html: string, options?: ParserOptions): ParsedProduct[];
}

export function createJsonLdAdapter(marketplace: string, hosts: string[]): JsonLdAdapter {
  const allowed = new Set(hosts.map((host) => host.toLowerCase()));
  return {
    marketplace,
    supports(hostname) {
      const host = hostname.toLowerCase().replace(/^www\./, "");
      return allowed.has(host);
    },
    parse(url, html) {
      return parseProductJsonLd(html).map((item, index) => fixtureToParsedProduct(item, marketplace, `jsonld-${index}`, url.toString()));
    },
  };
}
