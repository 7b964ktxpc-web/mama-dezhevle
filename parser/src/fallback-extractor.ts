export interface FallbackProductData {
  title?: string;
  brand?: string;
  price?: number;
  oldPrice?: number;
  currency?: string;
  available?: boolean;
  url?: string;
}

function clean(value: string | undefined) { return value?.replace(/\s+/g, " ").trim(); }

function toNumber(value: string | undefined): number | undefined {
  if (!value) return undefined;
  const n = Number(value.replace(/\u00a0/g, " ").replace(/\s/g, "").replace(",", "."));
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

function priceFromText(value: string): number | undefined {
  const normalized = value.replace(/\u00a0/g, " ").replace(/\s+/g, " ");
  const match = normalized.match(/(\d{1,3}(?:[ \u00a0.]\d{3})*(?:,\d{1,2})?)\s*(?:₽|руб(?:\.|лей)?|RUB)/i);
  return match ? toNumber(match[1]) : undefined;
}

export function extractFallbackProductData(html: string, pageUrl?: string): FallbackProductData {
  const title = clean(html.match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)/i)?.[1] ?? html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]);
  const brand = clean(html.match(/<meta[^>]+(?:name|property)=["'](?:product:brand|og:brand)["'][^>]+content=["']([^"']+)/i)?.[1]);
  const priceRaw = html.match(/<meta[^>]+(?:property|name)=["'](?:product:price:amount|og:price:amount)["'][^>]+content=["']([^"']+)/i)?.[1];
  const oldPriceRaw = html.match(/<meta[^>]+(?:property|name)=["'](?:product:price:old|og:price:old|product:original_price)["'][^>]+content=["']([^"']+)/i)?.[1];
  const currency = clean(html.match(/<meta[^>]+(?:property|name)=["'](?:product:price:currency|og:price:currency)["'][^>]+content=["']([^"']+)/i)?.[1]) ?? "RUB";
  const price = toNumber(priceRaw) ?? priceFromText(html);
  const oldPrice = toNumber(oldPriceRaw);
  const availabilityRaw = html.match(/<meta[^>]+(?:property|name)=["'](?:product:availability|og:availability)["'][^>]+content=["']([^"']+)/i)?.[1];
  const available = availabilityRaw ? !/(out|sold|unavailable|нет\s+в\s+наличии)/i.test(availabilityRaw) : undefined;
  const url = clean(html.match(/<meta[^>]+property=["']og:url["'][^>]+content=["']([^"']+)/i)?.[1]) ?? pageUrl;
  return { title, brand, price, oldPrice: oldPrice !== undefined && price !== undefined && oldPrice > price ? oldPrice : undefined, currency, available, url: url || undefined };
}
