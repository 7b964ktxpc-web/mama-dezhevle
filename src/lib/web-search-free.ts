import type { SearchResult } from "./product-search";

const DDG_HTML = "https://html.duckduckgo.com/html/";
const MARKET_RE = /(ozon\.ru|wildberries\.ru|detmir\.ru|market\.yandex\.ru|aliexpress\.com|labirint\.ru|akusherstvo\.ru|mumukind\.ru)/i;
const PRICE_RE = /(\d[\d\s]{2,}(?:[.,]\d{1,2})?)\s*(?:₽|руб)/i;
const REQUEST_TIMEOUT_MS = 15_000;

function stripHtml(html: string) {
  return html
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function parsePrice(text: string): number | null {
  const m = PRICE_RE.exec(text);
  if (!m) return null;
  const n = Number(m[1].replace(/\s/g, "").replace(",", "."));
  return Number.isFinite(n) && n > 0 && n < 100_000_000 ? Math.round(n) : null;
}

function domainOf(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

/**
 * Keyless product search: queries DuckDuckGo HTML (no API key) and keeps only
 * results pointing at real marketplaces, with a best-effort price parsed from
 * the snippet. The AI/conversation layer then forwards these links to the user,
 * who sees the live price on the store page. Works without any API or parser.
 */
export async function searchDuckDuckGo(query: string, limit = 10): Promise<SearchResult[]> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(DDG_HTML, {
      method: "POST",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
        "user-agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36",
      },
      body: `q=${encodeURIComponent(query)}`,
      signal: controller.signal,
    });
    if (!response.ok) return [];
    const html = await response.text();

    const linkRe = /<a[^>]+class="result__a"[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g;
    const snippetRe = /class="result__snippet"[^>]*>([\s\S]*?)<\/a>/g;

    const links: Array<{ url: string; title: string }> = [];
    let lm: RegExpExecArray | null;
    while ((lm = linkRe.exec(html))) {
      const uddg = /uddg=([^&]+)/.exec(lm[1]);
      if (!uddg) continue;
      const url = decodeURIComponent(uddg[1]);
      if (!MARKET_RE.test(url)) continue;
      links.push({ url, title: stripHtml(lm[2]) });
    }

    const snippets: string[] = [];
    let sm: RegExpExecArray | null;
    while ((sm = snippetRe.exec(html))) snippets.push(stripHtml(sm[1]));

    return links.slice(0, limit).map((link, i): SearchResult => {
      const snippet = snippets[i] ?? "";
      const price = parsePrice(`${link.title} ${snippet}`);
      return {
        id: `ddg-${i}-${Math.random().toString(36).slice(2, 8)}`,
        title: link.title || domainOf(link.url),
        price: price ?? 0,
        oldPrice: null,
        rating: null,
        url: link.url,
        source: domainOf(link.url),
        verified: false,
        verificationStatus: price ? "snippet" : "unverified",
      };
    });
  } catch {
    return [];
  } finally {
    clearTimeout(timer);
  }
}
