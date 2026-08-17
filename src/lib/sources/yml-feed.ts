import type { ProductSource } from "./source";
import { loadYmlFeed } from "../feeds/yml";

const DEFAULT_SOURCE = "partner-yml";

/** Production catalog source. Requires an explicitly configured, permitted YML feed URL. */
export const ymlFeedSource: ProductSource = {
  id: "partner-yml",
  name: "Партнёрский YML-фид",
  isEnabled: () => Boolean(process.env.CATALOG_YML_URL),
  collect: async () => {
    const url = process.env.CATALOG_YML_URL;
    if (!url) throw new Error("CATALOG_YML_URL is required for the production YML source");
    const feed = await loadYmlFeed(url, process.env.CATALOG_YML_SOURCE || DEFAULT_SOURCE);
    return feed.products;
  },
};
