import { spawn } from "node:child_process";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import type { SearchResult } from "./product-search";

// kettu-marketplace-mcp (https://github.com/Veikkokettu/kettu-marketplace-mcp)
// is a Python MCP server with anonymous-HTTP connectors for Wildberries,
// Yandex Market, Detmir, Ozon and others. We call its tools directly via a
// small Python helper (no MCP protocol) using `uv run`.
// Enable by setting KETTU_DIR to the cloned repo path (with `uv sync` done).

function kettuDir() {
  return process.env.KETTU_DIR?.trim();
}

function helperPath() {
  return process.env.KETTU_HELPER?.trim() || path.join(process.cwd(), "scripts", "kettu-helper.py");
}

async function callKettu<T>(tool: string, args: Record<string, unknown>, timeoutMs = 45000): Promise<T | null> {
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
        reject(new Error(`kettu ${tool}: timeout`));
      }, timeoutMs);
      child.stdout.on("data", (d) => { out += String(d); });
      child.stderr.on("data", (d) => { err = (err + String(d)).slice(-2000); });
      child.on("error", (e) => { clearTimeout(timer); reject(e); });
      child.on("close", (code) => {
        clearTimeout(timer);
        if (code === 0) resolve(out);
        else reject(new Error(`kettu ${tool}: exit ${code}: ${err}`));
      });
    });
    const line = stdout.trim().split(/\r?\n/).filter(Boolean).pop();
    return line ? (JSON.parse(line) as T) : null;
  } catch (error) {
    console.warn(`[kettu] ${String(error)}`);
    return null;
  } finally {
    await fs.rm(argsFile, { force: true }).catch(() => {});
  }
}

type WbItem = {
  nm_id: number;
  name?: string | null;
  brand?: string | null;
  price_rub?: number | null;
  price_original_rub?: number | null;
  review_rating?: number | null;
  in_stock?: boolean | null;
};

type YmItem = {
  product_id: string | number;
  title?: string | null;
  brand?: string | null;
  seller?: string | null;
  price_rub?: number | null;
  price_old_rub?: number | null;
  rating?: number | null;
  url?: string | null;
  image?: string | null;
};

export async function searchViaKettu(query: string, limit = 5): Promise<SearchResult[]> {
  if (!kettuDir()) return [];
  const [wb, ym] = await Promise.all([
    callKettu<{ items?: WbItem[] }>("wb_search", { query }),
    callKettu<{ items?: YmItem[] }>("yandex_search", { query, limit: Math.min(Math.max(limit * 2, 5), 20) }),
  ]);
  const results: SearchResult[] = [];
  for (const item of wb?.items ?? []) {
    const price = Number(item.price_rub);
    if (!Number.isFinite(price) || price <= 0) continue;
    results.push({
      id: `wb-${item.nm_id}`,
      title: item.name || "Товар",
      price,
      oldPrice: item.price_original_rub == null ? null : Number(item.price_original_rub),
      rating: item.review_rating == null ? null : Number(item.review_rating),
      url: `https://www.wildberries.ru/catalog/${item.nm_id}/detail.aspx`,
      imageUrl: null,
      source: "Wildberries",
    });
  }
  for (const item of ym?.items ?? []) {
    const price = Number(item.price_rub);
    if (!Number.isFinite(price) || price <= 0) continue;
    results.push({
      id: `ym-${item.product_id}`,
      title: item.title || "Товар",
      price,
      oldPrice: item.price_old_rub == null ? null : Number(item.price_old_rub),
      rating: item.rating == null ? null : Number(item.rating),
      url: item.url || `https://market.yandex.ru/product/${item.product_id}`,
      imageUrl: item.image ? String(item.image) : null,
      source: item.seller ? `Яндекс: ${item.seller}` : "Яндекс Маркет",
    });
  }
  results.sort((a, b) => a.price - b.price);
  return results.slice(0, limit);
}
