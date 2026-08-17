import type { ProductSource } from "./source";
import { yandexMarketAffiliateSource } from "./yandex-market-affiliate";

/**
 * Partner marketplace registry.
 * These are deliberately NOT seller APIs. Each adapter must use an official
 * affiliate/partner mechanism and a permitted machine-readable endpoint/feed.
 * No scraper, CAPTCHA bypass, or seller-only credential is allowed here.
 */
export const PARTNER_MARKETPLACES = ["yandex-market", "ozon", "wildberries"] as const;
export type PartnerMarketplace = (typeof PARTNER_MARKETPLACES)[number];

export function configuredPartnerSources(): ProductSource[] {
  return [yandexMarketAffiliateSource].filter((source) => source.isEnabled());
}
