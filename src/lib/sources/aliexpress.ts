import type { ProductSource } from "./source";
import { loadYmlFeed } from "../feeds/yml";

/**
 * AliExpress adapter is intentionally feed-based. It only becomes active when
 * an official/partner machine-readable feed URL is supplied. No scraping or
 * undocumented AliExpress endpoints are used.
 */
export const aliExpressSource: ProductSource = {
  id: "aliexpress",
  name: "AliExpress (partner feed)",
  isEnabled: () => Boolean(process.env.ALIEXPRESS_YML_URL),
  collect: async () => {
    const url = process.env.ALIEXPRESS_YML_URL;
    if (!url) return [];
    return (await loadYmlFeed(url, "aliexpress")).products;
  },
};
