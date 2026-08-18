export interface FallbackProductData {
  title?: string;
  brand?: string;
  price?: number;
  currency?: string;
  url?: string;
}

function clean(value: string | undefined) {
  return value?.replace(/\\s+/g, " ").trim();
}

function priceFromText(value: string): number | undefined {
  const normalized = value.replace(/\\u00a0/g, " ").replace(/\\s+/g, " ");
  const match = normalized.match(/(\\d{1,3}(?:[ \\u00a0.]\\d{3})*(?:,\\d{1,2})?)\\s*(?:₽|руб(?:\\.|лей)?|RUB)\\b?/i);
  if (!match) return undefined;
  const number = Number(match[1].replace(/[ \\u00a0.]/g, "").replace(",", "."));
  return Number.isFinite(number) && number > 0 ? number : undefined;
}

export function extractFallbackProductData(html: string, pageUrl?: string): FallbackProductData {
  const title = clean(html.match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)/i)?.[1]
    ?? html.match(/<title[^>]*>([\\s\\S]*?)<\\/title>/i)?.[1]);
  const description = clean(html.match(/<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']+)/i)?.[1]);
  const brand = clean(html.match(/<meta[^>]+(?:name|property)=["'](?:product:brand|og:brand)["'][^>]+content=["']([^"']+)/i)?.[1]);
  const priceRaw = html.match(/<meta[^>]+(?:property|name)=["'](?:product:price:amount|og:price:amount)["'][^>]+content=["']([^"']+)/i)?.[1];
  const currency = clean(html.match(/<meta[^>]+(?:property|name)=["'](?:product:price:currency|og:price:currency)["'][^>]+content=["']([^"']+)/i)?.[1]) ?? "RUB";
  const price = priceRaw ? Number(priceRaw.replace(/\\s/g, "").replace(",", ".")) : priceFromText(html);
  const url = clean(html.match(/<meta[^>]+property=["']og:url["'][^>]+content=["']([^"']+)/i)?.[1]) ?? pageUrl;
  return { title, brand, price: Number.isFinite(price) && price > 0 ? price : undefined, currency, url: url || undefined, ...(description ? {} : {}) };
}
