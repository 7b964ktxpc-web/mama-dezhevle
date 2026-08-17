import type { ProductSource } from "./source";
import { simaLandSource } from "./sima-land";
import { yandexMarketAffiliateSource } from "./yandex-market-affiliate";
import { aliExpressSource } from "./aliexpress";

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
  return [simaLandSource, yandexMarketAffiliateSource, aliExpressSource]
    .filter((source) => source.isEnabled());
}

/**
 * AliExpress uses only a configured official/partner YML feed. Until
 * ALIEXPRESS_YML_URL is supplied, the source remains disabled.
 */
