import { getSupabaseAdmin } from "./supabase-admin";

/**
 * Affiliate + click-tracking layer.
 *
 * Two independent mechanisms, both optional:
 *  1. Affiliate URL rewriting — if `AFFILIATE_TEMPLATE_<SOURCE>` is set, the raw
 *     product URL is wrapped with the partner template (e.g. `...?url={url}&p=ID`).
 *     Sources without a template keep their original URL.
 *  2. Click tracking — if `PUBLIC_SITE_URL` is set, catalog links are wrapped in
 *     `/go?p=<productId>` so the Next.js route can record the click and then 302
 *     to the (affiliate) product URL. Web-search results without a product id fall
 *     back to the affiliate URL directly.
 *
 * AI never invents or edits these links; they are derived purely from source config.
 */

function publicSiteUrl(): string | null {
  const value = process.env.PUBLIC_SITE_URL?.trim().replace(/\/$/, "");
  return value || null;
}

function affiliateTemplateFor(source: string | null | undefined): string | null {
  if (!source) return null;
  const key = `AFFILIATE_TEMPLATE_${source.toUpperCase().replace(/[^A-Z0-9]/g, "_")}`;
  return process.env[key]?.trim() || null;
}

export function affiliateUrlFor(source: string | null | undefined, url: string): string {
  const template = affiliateTemplateFor(source);
  if (!template || !url) return url;
  return template.replace(/\{url\}/gi, encodeURIComponent(url));
}

export function trackedUrlFor(productId: string | number | null | undefined, source: string | null | undefined, url: string): string {
  if (!url) return url;
  const affiliate = affiliateUrlFor(source, url);
  const site = publicSiteUrl();
  if (site && productId != null && productId !== "") {
    return `${site}/go?p=${encodeURIComponent(String(productId))}`;
  }
  return affiliate;
}

export type ClickStat = {
  product_id: string;
  source: string | null;
  title: string | null;
  clicks: number;
};

export async function recordClick(productId: string): Promise<{ url: string } | null> {
  const supabase = getSupabaseAdmin();
  const { data: product, error } = await supabase
    .from("products")
    .select("url, source, title")
    .eq("id", productId)
    .maybeSingle();
  if (error || !product?.url) return null;

  const target = affiliateUrlFor(product.source, product.url);

  await supabase.from("link_clicks").insert({ product_id: productId, source: product.source ?? null });
  return { url: target };
}

export async function getTopClicks(limit = 20): Promise<ClickStat[]> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("link_clicks")
    .select("product_id, source, products(title)")
    .order("created_at", { ascending: false })
    .limit(5000);
  if (error || !data) return [];

  const counts = new Map<string, ClickStat>();
  for (const row of data as Array<{ product_id: string; source: string | null; products?: Array<{ title: string | null }> | null }>) {
    const existing = counts.get(row.product_id);
    const title = row.products?.[0]?.title ?? null;
    if (existing) {
      existing.clicks += 1;
    } else {
      counts.set(row.product_id, {
        product_id: row.product_id,
        source: row.source,
        title,
        clicks: 1,
      });
    }
  }
  return [...counts.values()].sort((a, b) => b.clicks - a.clicks).slice(0, limit);
}
