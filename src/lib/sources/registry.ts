import type { ProductSource } from "./source";
import { getDetmirFixture } from "./detmir-public";

/**
 * Registry of sources that are currently permitted and configured.
 * Keep real marketplace adapters opt-in: adding a source should require an
 * explicit environment flag instead of silently scraping a website.
 */
export const productSources: ProductSource[] = [
  {
    id: "detmir-fixture",
    name: "Детский мир (fixture)",
    isEnabled: () => process.env.DETMIR_FIXTURE_ENABLED !== "false",
    collect: getDetmirFixture,
  },
];

export function enabledProductSources() {
  return productSources.filter((source) => source.isEnabled());
}
