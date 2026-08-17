import type { ProductSource } from "./source";
import { loadYmlFeed } from "../feeds/yml";

const DEFAULT_SOURCE = "partner-yml";

function configuredYmlFeeds() {
  const urls = [
    process.env.CATALOG_YML_URL,
    ...(process.env.CATALOG_YML_URLS || "")
      .split(",")
      .map((url) => url.trim())
      .filter(Boolean),
  ].filter((url, index, all): url is string => Boolean(url) && all.indexOf(url) === index);

  return urls.map((url, index) => ({
    url,
    source: index === 0 && process.env.CATALOG_YML_SOURCE
      ? process.env.CATALOG_YML_SOURCE
      : `${DEFAULT_SOURCE}-${index + 1}`,
  }));
}

/**
 * Build one production source per configured YML feed.
 * This keeps the collector source-agnostic: adding another permitted YML
 * supplier only requires configuration, not a collector/code change.
 */
export function configuredYmlSources(): ProductSource[] {
  return configuredYmlFeeds().map(({ url, source }) => ({
    id: source,
    name: `YML-фид: ${source}`,
    isEnabled: () => true,
    collect: async () => (await loadYmlFeed(url, source)).products,
  }));
}

/** Backwards-compatible single production source. */
export const ymlFeedSource: ProductSource = {
  id: DEFAULT_SOURCE,
  name: "Партнёрский YML-фид",
  isEnabled: () => configuredYmlFeeds().length > 0,
  collect: async () => {
    const [source] = configuredYmlSources();
    if (!source) throw new Error("CATALOG_YML_URL or CATALOG_YML_URLS is required for the production YML source");
    return source.collect();
  },
};
