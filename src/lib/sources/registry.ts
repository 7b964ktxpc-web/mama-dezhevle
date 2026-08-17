import type { ProductSource } from "./source";
import { getDetmirFixture } from "./detmir-public";
import { ymlFeedSource } from "./yml-feed";

/**
 * Registry of permitted catalog sources.
 * Production sources must be explicitly configured through environment
 * variables. Fixtures are opt-in and never enabled implicitly in production.
 */
export const productSources: ProductSource[] = [
  ymlFeedSource,
  {
    id: "detmir-fixture",
    name: "Детский мир (fixture)",
    isEnabled: () => process.env.DETMIR_FIXTURE_ENABLED === "true",
    collect: getDetmirFixture,
  },
];

export function enabledProductSources() {
  return productSources.filter((source) => source.isEnabled());
}
