import type { ProductSource } from "./source";
import { collectDetmirPublic } from "./detmir-public";
import { configuredYmlSources } from "./yml-feed";
import { configuredPartnerSources } from "./partner-marketplaces";

/**
 * Registry of permitted catalog sources.
 * Production sources are configured explicitly through environment variables
 * or an official marketplace partner adapter. Seller-only APIs are not used.
 */
export function enabledProductSources(): ProductSource[] {
  const configured: ProductSource[] = [
    ...configuredYmlSources(),
    ...configuredPartnerSources(),
  ];

  if (process.env.DETMIR_PUBLIC_ENABLED === "true") {
    configured.push({
      id: "detmir-public",
      name: "Детский мир (public catalog)",
      isEnabled: () => true,
      collect: collectDetmirPublic,
    });
  }

  return configured;
}
