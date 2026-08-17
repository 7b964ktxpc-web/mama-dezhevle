import type { ProductSource } from "./source";
import { simaLandSource } from "./sima-land";
import { yandexMarketAffiliateSource } from "./yandex-market-affiliate";

/**
 * Partner/catalog marketplace registry.
 * Seller-only APIs are not used. Each active adapter must use an official
 * affiliate/partner mechanism or permitted machine-readable catalog endpoint.
 */
export const PARTNER_MARKETPLACES = [
  "yandex-market",
  "ozon",
  "wildberries",
  "sima-land",
  "aliexpress",
] as const;
export type PartnerMarketplace = (typeof PARTNER_MARKETPLACES)[number];

export function configuredPartnerSources(): ProductSource[] {
  return [simaLandSource, yandexMarketAffiliateSource]
    .filter((source) => source.isEnabled());
}

/**
 * AliExpress is represented in the architecture now, but remains disabled
 * until we verify the currently available official affiliate API/feed and
 * its credentials. We do not enable scraping or undocumented endpoints.
 */
