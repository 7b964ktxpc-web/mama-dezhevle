import type { Product } from "../product";

/**
 * Parser for an Ozon affiliate XML/YML product feed.
 * The feed URL is supplied through OZON_FEED_URL and is never committed.
 *
 * We intentionally keep the parser dependency-free so the MVP can run on
 * GitHub Actions without paying for a scraping service.
 */
export async function collectOzonXmlFeed(feedUrl = process.env.OZON_FEED_URL): Promise<Product[]> {
  if (!feedUrl) throw new Error("Missing OZON_FEED_URL");

  const response = await fetch(feedUrl, { headers: { "user-agent": "MamaDezhevle/0.1" } });
  if (!response.ok) throw new Error(`Ozon feed returned ${response.status}`);

  const xml = await response.text();
  return parseYml(xml);
}

function text(node: string, tag: string) {
  const match = node.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, "i"));
  return match ? decode(match[1].trim()) : "";
}

function attr(node: string, name: string) {
  const match = node.match(new RegExp(`${name}=["']([^"']+)["']`, "i"));
  return match?.[1] ?? "";
}

function decode(value: string) {
  return value
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function money(value: string) {
  const normalized = value.replace(/\s/g, "").replace(",", ".");
  const number = Number(normalized.replace(/[^0-9.]/g, ""));
  return Number.isFinite(number) ? number : 0;
}

function parseYml(xml: string): Product[] {
  const offers = xml.match(/<offer\b[\s\S]*?<\/offer>/gi) ?? [];

  return offers
    .map((offer): Product | null => {
      const externalId = attr(offer, "id");
      const title = text(offer, "name");
      const url = text(offer, "url");
      const currentPrice = money(text(offer, "price"));
      const oldPriceRaw = text(offer, "oldprice") || text(offer, "old_price");
      const referencePrice = oldPriceRaw ? money(oldPriceRaw) : null;
      const available = attr(offer, "available") !== "false";
      const category = text(offer, "category");
      const imageUrl = text(offer, "picture");

      if (!externalId || !title || !url || currentPrice <= 0) return null;

      return {
        externalId,
        source: "ozon",
        title,
        url,
        currentPrice,
        referencePrice: referencePrice && referencePrice > currentPrice ? referencePrice : null,
        available,
        category: category || null,
        imageUrl: imageUrl || null,
      };
    })
    .filter((item): item is Product => item !== null);
}
