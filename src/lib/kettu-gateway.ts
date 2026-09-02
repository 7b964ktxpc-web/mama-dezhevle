import { spawn } from "node:child_process";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { groupOffers, type ProductGroup } from "./product-matcher";
import { applyPriceEngine } from "./price-engine";

// Marketplace Gateway over kettu-marketplace-mcp. Every source is normalized
// into one Offer shape, searched in parallel with real per-source status,
// grouped by Product Matcher and ranked by Price Engine. No fake data: a
// source that does not answer is reported as failed/unavailable, never
// substituted with invented offers.

export type Offer = {
  source: string;
  sourceProductId: string;
  title: string;
  brand?: string | null;
  image?: string | null;
  url: string;
  seller?: string | null;
  price: number;
  oldPrice?: number | null;
  discountPercent?: number | null;
  currency: string;
  availability?: boolean | null;
  rating?: number | null;
  reviewsCount?: number | null;
  deliveryPrice?: number | null;
  deliveryDate?: string | null;
  promo?: string | null;
  cashback?: number | null;
  effectivePrice?: number;
  dealScore?: number | null;
  verified?: boolean;
  verificationStatus?: string;
  fetchedAt: string;
};

export type SourceStatus = {
  source: string;
  label: string;
  status: "ok" | "empty" | "failed" | "skipped";
  count: number;
  ms: number;
  error?: string;
};

export type SearchEvent =
  | { type: "SEARCH_STARTED"; searchId: string; query: string; sources: string[] }
  | { type: "SOURCE_STARTED"; source: string }
  | { type: "SOURCE_COMPLETED"; source: string; count: number; ms: number }
  | { type: "SOURCE_FAILED"; source: string; error: string; ms: number }
  | { type: "SOURCE_SKIPPED"; source: string; reason: string }
  | { type: "MATCHING_STARTED"; offers: number }
  | { type: "PRICE_CHECK_STARTED" }
  | { type: "VERIFICATION_STARTED" }
  | { type: "BEST_DEAL_FOUND"; title: string; price: number }
  | { type: "SEARCH_COMPLETED"; searchId: string; offers: number; groups: number; ms: number };

export type GatewayResult = {
  searchId: string;
  offers: Offer[];
  groups: ProductGroup[];
  statuses: SourceStatus[];
  durationMs: number;
  fromCache: boolean;
};

function kettuDir() {
  // Serverless (Vercel) has no local uv/kettu install — always disabled there
  // regardless of stray env values; the catalog fallback covers the web app.
  if (process.env.VERCEL === "1" || process.env.VERCEL_ENV) return undefined;
  return process.env.KETTU_DIR?.trim();
}

function helperPath() {
  return process.env.KETTU_HELPER?.trim() || path.join(process.cwd(), "scripts", "kettu-helper.py");
}

function chromeEnabled() {
  return process.env.KETTU_CHROME === "1";
}

function sourceTimeoutMs() {
  return Number(process.env.KETTU_SOURCE_TIMEOUT_MS) || 45000;
}

function cacheTtlMs() {
  return Number(process.env.KETTU_CACHE_TTL_MS) || 10 * 60 * 1000;
}

export async function callKettu<T>(tool: string, args: Record<string, unknown>, timeoutMs = sourceTimeoutMs()): Promise<T | null> {
  const dir = kettuDir();
  if (!dir) return null;
  const argsFile = path.join(os.tmpdir(), `kettu-args-${Date.now()}-${Math.random().toString(36).slice(2)}.json`);
  try {
    await fs.writeFile(argsFile, JSON.stringify(args), "utf8");
    const uv = process.env.KETTU_UV_PATH?.trim() || "uv";
    const stdout = await new Promise<string>((resolve, reject) => {
      const child = spawn(uv, ["run", "--directory", dir, "python", helperPath(), tool, argsFile], { windowsHide: true });
      let out = "";
      let err = "";
      const timer = setTimeout(() => {
        child.kill();
        reject(new Error(`timeout after ${timeoutMs}ms`));
      }, timeoutMs);
      child.stdout.on("data", (d) => { out += String(d); });
      child.stderr.on("data", (d) => { err = (err + String(d)).slice(-2000); });
      child.on("error", (e) => { clearTimeout(timer); reject(e); });
      child.on("close", (code) => {
        clearTimeout(timer);
        if (code === 0) resolve(out);
        else reject(new Error(err || `exit ${code}`));
      });
    });
    const line = stdout.trim().split(/\r?\n/).filter(Boolean).pop();
    return line ? (JSON.parse(line) as T) : null;
  } catch (error) {
    const message = String(error);
    throw new Error(`${tool}: ${message.slice(0, 300)}`);
  } finally {
    await fs.rm(argsFile, { force: true }).catch(() => {});
  }
}

const now = () => new Date().toISOString();

// Verifier stage 2: marketplace search engines routinely mix hats and mittens
// into a "jacket" query. The primary product word of the query must appear in
// the offer title (crude stem match); unrelated items are dropped. If nothing
// survives we keep the raw list rather than leaving the parent empty-handed.
const STOP_WORDS = new Set([
  "для", "на", "до", "под", "перед", "лет", "года", "год", "году", "летом", "зимой",
  "мальчик", "мальчику", "мальчика", "девочка", "девочке", "девочки", "дочери", "сына", "сыну",
  "ребенок", "ребенку", "ребенка", "ребенком", "малыша", "малышу", "малыш",
  "размер", "размеру", "росту", "рост", "руб", "рублей", "бюджет", "цена", "цене",
  "нужен", "нужна", "нужно", "нужны", "купить", "найди", "ищу", "ищем", "подбери", "поищи",
  "дешевле", "дешевые", "дешевый", "выгодно", "выгодные", "хочу", "надо", "пожалуйста",
  "осень", "осенью", "зима", "весна", "летний", "зимний", "осенний",
]);

function normalizeWord(word: string): string {
  return word.toLowerCase().replace(/ё/g, "е").replace(/[^a-zа-я0-9]/g, "");
}

function primaryStem(query: string): string | null {
  for (const raw of query.split(/[\s,]+/)) {
    const word = normalizeWord(raw);
    if (word.length < 4 || STOP_WORDS.has(word)) continue;
    return word.slice(0, Math.max(4, word.length - 2));
  }
  return null;
}

export function filterRelevant(offers: Offer[], query: string): { kept: Offer[]; dropped: number } {
  const stem = primaryStem(query);
  const wantedGender = genderOf(query);
  let kept = offers;
  let dropped = 0;
  if (stem) {
    const byStem = offers.filter((offer) => normalizeWord(offer.title).includes(stem));
    if (byStem.length) {
      dropped += offers.length - byStem.length;
      kept = byStem;
    }
  }
  if (wantedGender) {
    const byGender = kept.filter((offer) => {
      const offerGender = genderOf(offer.title);
      if (offerGender && offerGender !== wantedGender) return false;
      if (wantedGender === "boy" && FEMALE_ONLY_RE.test(offer.title)) return false;
      return true;
    });
    if (byGender.length) {
      dropped += kept.length - byGender.length;
      kept = byGender;
    }
  }
  return { kept, dropped };
}

// Verifier stage 3: gender mismatch. "Куртка мальчику" must not return
// "куртка для девочки". We only drop offers when the query states one gender
// explicitly and the title states the opposite one; unisex/neutral items stay.
const GIRL_RE = /\bдевочк\w*\b/i;
const BOY_RE = /\bмальчик\w*\b/i;
const FEMALE_RE = /\bдевочк\w*\b|\bдевичь\w*\b/i;
const MALE_RE = /\bмальчик\w*\b/i;
const FEMALE_ONLY_RE = /\b(юбк\w*|плать\w*|сарафан\w*)\b/i;

function genderOf(text: string): "boy" | "girl" | null {
  const girl = GIRL_RE.test(text);
  const boy = BOY_RE.test(text);
  if (girl && !boy) return "girl";
  if (boy && !girl) return "boy";
  return null;
}

function toNumber(value: unknown): number | null {
  if (value == null) return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  const cleaned = String(value).replace(/[^\d.,]/g, "").replace(/\s/g, "").replace(",", ".");
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

function validOffer(offer: Offer): boolean {
  return Boolean(offer.url) && Number.isFinite(offer.price) && offer.price > 0;
}

type ItemsPayload = { items?: Array<Record<string, unknown>> };

type SourceDef = {
  id: string;
  label: string;
  tool: string;
  selfcheckTool: string;
  needsChrome?: boolean;
  textSearch: boolean;
  args: (query: string, limit: number) => Record<string, unknown>;
  map: (payload: ItemsPayload) => Offer[];
};

function simpleMap(source: string, idField: string, titleField: string, priceField: string, oldField: string | null, extra?: (item: Record<string, unknown>) => Partial<Offer>) {
  return (payload: ItemsPayload): Offer[] =>
    (payload.items ?? []).map((item) => {
      const id = String(item[idField] ?? "");
      const base: Offer = {
        source,
        sourceProductId: id,
        title: String(item[titleField] ?? "Товар"),
        brand: item.brand ? String(item.brand) : null,
        image: item.image ? String(item.image) : null,
        url: String(item.url ?? ""),
        seller: item.seller ? String(item.seller) : item.supplier ? String(item.supplier) : item.shop_name ? String(item.shop_name) : item.seller_name ? String(item.seller_name) : null,
        price: toNumber(item[priceField]) ?? 0,
        oldPrice: oldField ? toNumber(item[oldField]) : null,
        currency: priceField === "price_cny" ? "CNY" : "RUB",
        availability: item.in_stock != null ? Boolean(item.in_stock) : item.is_available != null ? Boolean(item.is_available) : null,
        rating: toNumber(item.rating ?? item.review_rating),
        reviewsCount: toNumber(item.rating_count ?? item.feedbacks),
        fetchedAt: now(),
      };
      return { ...base, ...extra?.(item) };
    }).filter(validOffer);
}

export const SOURCE_DEFS: SourceDef[] = [
  {
    id: "wildberries", label: "Wildberries", tool: "wb_search", selfcheckTool: "wb_selfcheck", textSearch: true,
    args: (query) => ({ query }),
    map: (payload) =>
      (payload.items ?? []).map((item) => ({
        source: "wildberries",
        sourceProductId: String(item.nm_id ?? ""),
        title: String(item.name ?? "Товар"),
        brand: item.brand ? String(item.brand) : null,
        image: null,
        url: `https://www.wildberries.ru/catalog/${item.nm_id}/detail.aspx`,
        seller: item.supplier ? String(item.supplier) : null,
        price: toNumber(item.price_rub) ?? 0,
        oldPrice: toNumber(item.price_original_rub),
        currency: "RUB",
        availability: item.in_stock != null ? Boolean(item.in_stock) : null,
        rating: toNumber(item.review_rating),
        reviewsCount: toNumber(item.feedbacks),
        fetchedAt: now(),
      })).filter(validOffer),
  },
  {
    id: "yandex_market", label: "Яндекс Маркет", tool: "yandex_search", selfcheckTool: "yandex_selfcheck", textSearch: true,
    args: (query, limit) => ({ query, limit: Math.min(Math.max(limit * 2, 5), 20) }),
    map: simpleMap("yandex_market", "product_id", "title", "price_rub", "price_old_rub", (item) => {
      const plus = toNumber(item.price_with_plus);
      const price = toNumber(item.price_rub) ?? 0;
      return { promo: plus != null && plus < price ? `с подпиской Плюс: ${Math.round(plus)} ₽` : null };
    }),
  },
  {
    id: "megamarket", label: "Мегамаркет", tool: "megamarket_search", selfcheckTool: "megamarket_selfcheck", needsChrome: true, textSearch: true,
    args: (query) => ({ query }),
    map: simpleMap("megamarket", "item_id", "title", "price_rub", "old_price_rub"),
  },
  {
    id: "ozon", label: "Ozon", tool: "ozon_search", selfcheckTool: "ozon_selfcheck", needsChrome: true, textSearch: true,
    args: (query) => ({ query }),
    map: (payload) =>
      (payload.items ?? []).map((item) => ({
        source: "ozon",
        sourceProductId: String(item.sku ?? ""),
        title: String(item.title ?? "Товар"),
        brand: null,
        image: null,
        url: String(item.url ?? ""),
        seller: null,
        price: toNumber(item.price) ?? 0,
        oldPrice: toNumber(item.price_original),
        currency: "RUB",
        availability: item.stock ? !/нет/i.test(String(item.stock)) : null,
        rating: toNumber(item.rating),
        reviewsCount: toNumber(item.rating_count),
        fetchedAt: now(),
      })).filter(validOffer),
  },
  {
    id: "lamoda", label: "Lamoda", tool: "lamoda_search", selfcheckTool: "lamoda_selfcheck", needsChrome: true, textSearch: true,
    args: (query) => ({ query }),
    map: simpleMap("lamoda", "sku", "title", "price_rub", "old_price_rub"),
  },
  {
    id: "dns", label: "DNS", tool: "dns_search", selfcheckTool: "dns_selfcheck", needsChrome: true, textSearch: true,
    args: (query) => ({ query }),
    map: simpleMap("dns", "product_id", "title", "price_rub", "old_price_rub"),
  },
  {
    id: "citilink", label: "Ситилинк", tool: "citilink_search", selfcheckTool: "citilink_selfcheck", needsChrome: true, textSearch: true,
    args: (query) => ({ query }),
    map: simpleMap("citilink", "product_id", "title", "price_rub", "old_price_rub"),
  },
  {
    id: "avito", label: "Avito", tool: "avito_search", selfcheckTool: "avito_selfcheck", needsChrome: true, textSearch: true,
    args: (query) => ({ query }),
    map: simpleMap("avito", "item_id", "title", "price_rub", null),
  },
  {
    id: "taobao", label: "Taobao", tool: "taobao_search", selfcheckTool: "taobao_selfcheck", needsChrome: true, textSearch: true,
    args: (query) => ({ query }),
    map: simpleMap("taobao", "item_id", "title", "price_cny", null),
  },
  {
    // Detmir has no anonymous text search API; kettu exposes categories and
    // cards only. Listed for health status; excluded from text search.
    id: "detmir", label: "Детский мир", tool: "detmir_categories", selfcheckTool: "detmir_selfcheck", textSearch: false,
    args: () => ({ parent: "top", limit: 5 }),
    map: () => [],
  },
];

// Browser-backed sources verified to work with the CDP profile. The rest
// (megamarket/lamoda/dns/citilink/avito/taobao) are currently blocked by
// anti-bot on the fresh profile and only slow every search down; they stay
// registered for health checks and can be re-enabled via KETTU_SOURCES.
const CHROME_WHITELIST = new Set(["ozon"]);

export function activeSourceDefs(): SourceDef[] {
  const override = process.env.KETTU_SOURCES?.trim();
  const ids = override ? override.split(",").map((s) => s.trim()).filter(Boolean) : null;
  const defs = ids ? SOURCE_DEFS.filter((d) => ids.includes(d.id)) : SOURCE_DEFS;
  return defs.filter((d) => d.textSearch && (!d.needsChrome || (chromeEnabled() && CHROME_WHITELIST.has(d.id))));
}

const cache = new Map<string, { ts: number; result: GatewayResult }>();
const inflight = new Map<string, Promise<GatewayResult>>();

// Chrome/CDP is a single shared browser: hammering it with 7 concurrent
// playwright sessions makes every source time out. Anonymous HTTP sources run
// fully parallel; browser-backed ones go through a small pool.
async function mapPool<T, R>(items: T[], size: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(size, items.length) }, async () => {
    while (next < items.length) {
      const idx = next++;
      results[idx] = await fn(items[idx]);
    }
  });
  await Promise.all(workers);
  return results;
}

export async function gatewaySearch(
  query: string,
  opts: { limit?: number; onEvent?: (event: SearchEvent) => void } = {},
): Promise<GatewayResult> {
  const searchId = randomUUID().slice(0, 8);
  const startedAt = Date.now();
  const limit = opts.limit ?? 8;
  const emit = (event: SearchEvent) => {
    try { opts.onEvent?.(event); } catch { /* progress must never break search */ }
  };
  const empty: GatewayResult = { searchId, offers: [], groups: [], statuses: [], durationMs: 0, fromCache: false };
  if (!kettuDir()) return empty;

  const cacheKey = query.toLowerCase().trim();
  const cached = cache.get(cacheKey);
  if (cached && Date.now() - cached.ts < cacheTtlMs()) {
    emit({ type: "SEARCH_COMPLETED", searchId: cached.result.searchId, offers: cached.result.offers.length, groups: cached.result.groups.length, ms: 0 });
    return { ...cached.result, fromCache: true };
  }
  const running = inflight.get(cacheKey);
  if (running) return running;

  const job = (async (): Promise<GatewayResult> => {
    const defs = activeSourceDefs();
    emit({ type: "SEARCH_STARTED", searchId, query, sources: defs.map((d) => d.id) });
    const statuses: SourceStatus[] = [];
    const runDef = async (def: SourceDef): Promise<Offer[]> => {
      emit({ type: "SOURCE_STARTED", source: def.id });
      const t0 = Date.now();
      const timeout = def.needsChrome ? Number(process.env.KETTU_CHROME_TIMEOUT_MS) || 25000 : sourceTimeoutMs();
      try {
        const payload = await callKettu<ItemsPayload>(def.tool, def.args(query, limit), timeout);
        const offers = payload ? def.map(payload) : [];
        statuses.push({ source: def.id, label: def.label, status: offers.length ? "ok" : "empty", count: offers.length, ms: Date.now() - t0 });
        emit({ type: "SOURCE_COMPLETED", source: def.id, count: offers.length, ms: Date.now() - t0 });
        return offers;
      } catch (error) {
        const message = String(error);
        statuses.push({ source: def.id, label: def.label, status: "failed", count: 0, ms: Date.now() - t0, error: message.slice(0, 200) });
        emit({ type: "SOURCE_FAILED", source: def.id, error: message.slice(0, 120), ms: Date.now() - t0 });
        return [] as Offer[];
      }
    };
    const anonDefs = defs.filter((d) => !d.needsChrome);
    const chromeDefs = defs.filter((d) => d.needsChrome);
    const offerLists = [
      ...(await Promise.all(anonDefs.map(runDef))),
      ...(await mapPool(chromeDefs, 2, runDef)),
    ];

    const rawOffers = offerLists.flat().filter((o) => o.currency === "RUB");
    const { kept: offers, dropped } = filterRelevant(rawOffers, query);
    emit({ type: "MATCHING_STARTED", offers: offers.length });
    const groups = groupOffers(offers);
    emit({ type: "PRICE_CHECK_STARTED" });
    applyPriceEngine(groups);
    emit({ type: "VERIFICATION_STARTED" });
    const best = groups.find((g) => g.best.verified);
    if (best) emit({ type: "BEST_DEAL_FOUND", title: best.title, price: best.best.effectivePrice ?? best.best.price });
    const durationMs = Date.now() - startedAt;
    emit({ type: "SEARCH_COMPLETED", searchId, offers: offers.length, groups: groups.length, ms: durationMs });

    const result: GatewayResult = { searchId, offers, groups, statuses, durationMs, fromCache: false };
    console.log(JSON.stringify({
      event: "gateway_search", searchId, query, durationMs,
      sources: statuses.map((s) => `${s.source}:${s.status}:${s.count}`),
      offers: offers.length, groups: groups.length, irrelevantDropped: dropped,
      best_price: best ? best.best.effectivePrice ?? best.best.price : null,
      errors: statuses.filter((s) => s.status === "failed").map((s) => s.error),
    }));
    cache.set(cacheKey, { ts: Date.now(), result });
    return result;
  })();

  inflight.set(cacheKey, job);
  try {
    return await job;
  } finally {
    inflight.delete(cacheKey);
  }
}
