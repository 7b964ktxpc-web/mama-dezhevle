export type Marketplace = "ozon" | "wildberries" | "yandex-market" | "megamarket" | "detmir" | "unknown";

export interface ParsedProduct {
  marketplace: Marketplace;
  externalId: string;
  title: string;
  url: string;
  price: number;
  oldPrice?: number;
  currency: string;
  brand?: string;
  imageUrl?: string;
  rating?: number;
  reviewsCount?: number;
  available?: boolean;
  category?: string;
  sourceUrl: string;
  collectedAt: string;
}

export interface ParserOptions {
  timeoutMs?: number;
  concurrency?: number;
  userAgent?: string;
  maxProductsPerPage?: number;
  /** Search for children/teen products only. Enabled by default. */
  childrenOnly?: boolean;
}

export interface MarketplaceAdapter {
  id: Marketplace;
  matches(url: URL): boolean;
  parse(url: URL, html: string, options: ParserOptions): ParsedProduct[];
}
