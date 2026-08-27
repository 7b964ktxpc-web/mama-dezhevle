import type { SearchResult } from "./product-search";

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36";

function moneyFromKop(k: unknown) {
  const n = Number(k);
  return Number.isFinite(n) ? n / 100 : 0;
}

async function getJson(url: string, headers: Record<string, string> = {}): Promise<any> {
  const res = await fetch(url, { headers: { "user-agent": UA, accept: "application/json", ...headers } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

async function getText(url: string, headers: Record<string, string> = {}): Promise<string> {
  const res = await fetch(url, { headers: { "user-agent": UA, ...headers } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.text();
}

function cleanPrice(text: string): number {
  const n = Number(String(text).replace(/[^0-9.,]/g, "").replace(",", "."));
  return Number.isFinite(n) ? n : 0;
}

// ---------------------------------------------------------------------------
// Wildberries — публичный поисковый API (возвращает цены в копейках)
// ---------------------------------------------------------------------------
async function searchWildberries(query: string, limit: number): Promise<SearchResult[]> {
  const url =
    "https://search.wb.ru/exactmatch/ru/common/search?appType=1&curr=rub&dest=-1257781&resultset=catalog&query=" +
    encodeURIComponent(query);
  const json = await getJson(url);
  const products: any[] = json?.data?.products ?? [];
  return products
    .map((p): SearchResult => {
      const sale = moneyFromKop(p.salePriceU ?? p.price?.U ?? p.priceU);
      const full = moneyFromKop(p.price?.U ?? p.priceU);
      return {
        id: `wb-${p.id}`,
        title: String(p.name ?? p.brand ?? "Товар"),
        price: sale,
        oldPrice: full && full > sale ? full : null,
        rating: p.rating != null ? Number(p.rating) : null,
        url: `https://www.wildberries.ru/catalog/${p.id}/detail.aspx`,
        imageUrl: p.picsize ? `https://images.wbstatic.net/c516x688/${p.picsize}.jpg` : null,
        source: "wildberries",
        verified: true,
        verificationStatus: "marketplace",
      };
    })
    .filter((r) => r.price > 0)
    .slice(0, limit * 2);
}

// ---------------------------------------------------------------------------
// Детский мир — поисковая выдача, товары в JSON-LD
// ---------------------------------------------------------------------------
async function searchDetmir(query: string, limit: number): Promise<SearchResult[]> {
  const html = await getText(`https://www.detmir.ru/search/?q=${encodeURIComponent(query)}`);
  const results: SearchResult[] = [];
  const blocks = html.match(/<script[^>]+type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi) ?? [];
  for (const block of blocks) {
    const jsonText = block.replace(/<script[^>]*>/i, "").replace(/<\/script>/i, "").trim();
    let data: any;
    try {
      data = JSON.parse(jsonText);
    } catch {
      continue;
    }
    const items = Array.isArray(data) ? data : data && data["@graph"] ? data["@graph"] : [data];
    for (const item of items) {
      if (item?.["@type"] !== "Product") continue;
      const name = item.name ?? item.offers?.name;
      const offers = item.offers?.price ? item.offers : Array.isArray(item.offers) ? item.offers[0] : null;
      const price = offers ? cleanPrice(String(offers.price)) : 0;
      const oldPrice = offers?.priceCurrency && offers.highPrice ? cleanPrice(String(offers.highPrice)) : null;
      if (!name || price <= 0) continue;
      results.push({
        id: `detmir-${item.sku ?? item.gtin ?? name}`,
        title: String(name),
        price,
        oldPrice: oldPrice && oldPrice > price ? oldPrice : null,
        rating: null,
        url: typeof item.url === "string" ? item.url : `https://www.detmir.ru/search/?q=${encodeURIComponent(query)}`,
        imageUrl: typeof item.image === "string" ? item.image : null,
        source: "detmir",
        verified: true,
        verificationStatus: "marketplace",
      });
      if (results.length >= limit * 2) return results;
    }
  }
  return results;
}

// ---------------------------------------------------------------------------
// Ozon — Composer API (виджеты каталога). Форма ответа может меняться,
// поэтому парсим максимально устойчиво.
// ---------------------------------------------------------------------------
async function searchOzon(query: string, limit: number): Promise<SearchResult[]> {
  const url = `https://api.ozon.ru/composer-api.bx/page/json/v2?url=/search/?text=${encodeURIComponent(query)}`;
  const json = await getJson(url, { "Client-Api-Version": "2" });
  const states = json?.widgets?.widgetStates ?? {};
  const results: SearchResult[] = [];
  for (const value of Object.values(states) as any[]) {
    const items: any[] = value?.items ?? value?.data?.items ?? [];
    for (const item of items) {
      const price = cleanPrice(String(item.price ?? item.priceData?.price ?? item.priceData?.finalPrice ?? ""));
      const oldPrice = cleanPrice(String(item.oldPrice ?? item.priceData?.oldPrice ?? ""));
      const title = item.name ?? item.title ?? item.cellName;
      if (!title || price <= 0) continue;
      results.push({
        id: `ozon-${item.id ?? item.sku ?? title}`,
        title: String(title),
        price,
        oldPrice: oldPrice && oldPrice > price ? oldPrice : null,
        rating: item.rating != null ? Number(item.rating) : null,
        url: item.url ? `https://www.ozon.ru${item.url}` : `https://www.ozon.ru/search/?text=${encodeURIComponent(query)}`,
        imageUrl: item.image ?? item.picture ?? null,
        source: "ozon",
        verified: true,
        verificationStatus: "marketplace",
      });
      if (results.length >= limit * 2) return results;
    }
  }
  return results;
}

export async function searchMarketplaces(query: string, limit = 10): Promise<SearchResult[]> {
  const tasks = [searchWildberries(query, limit), searchDetmir(query, limit), searchOzon(query, limit)];
  const settled = await Promise.allSettled(tasks);
  const merged: SearchResult[] = [];
  for (const result of settled) {
    if (result.status === "fulfilled") merged.push(...result.value);
  }
  // Сортируем от дешёвого к дорогому, чтобы сразу показывать выгодные варианты.
  merged.sort((a, b) => a.price - b.price);
  const seen = new Set<string>();
  return merged
    .filter((item) => {
      const key = item.url || `${item.title.toLowerCase()}|${item.price}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, limit);
}
