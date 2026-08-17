import type { ProductSource } from "./source";
import { getDetmirFixture } from "./detmir-public";
import { configuredYmlSources } from "./yml-feed";
import { yandexMarketSource } from "./yandex-market";

/**
 * Registry of permitted catalog sources.
 * Production sources are configured explicitly through environment variables.
 * Fixtures are opt-in and never enabled implicitly in production.
 */
export function enabledProductSources(): ProductSource[] {
  const configured: ProductSource[] = [
    ...configuredYmlSources(),
  ];

  if (yandexMarketSource.isEnabled()) {
    configured.push(yandexMarketSource);
  }

  if (process.env.DETMIR_FIXTURE_ENABLED === "true") {
    configured.push({
      id: "detmir-fixture",
      name: "Детский мир (fixture)",
      isEnabled: () => true,
      collect: getDetmirFixture,
    });
  }

  return configured;
}
