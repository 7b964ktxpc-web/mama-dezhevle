import { searchMarketplaces } from "../lib/marketplace-search";

async function main() {
  const query = process.argv[2] || "кроссовки девочке 30 размера";
  console.log(`Query: ${query}`);
  const results = await searchMarketplaces(query, 10);
  console.log(`Found: ${results.length}`);
  for (const r of results.slice(0, 8)) {
    console.log(`- [${r.source}] ${r.title} — ${Math.round(r.price)} ₽${r.oldPrice ? ` (было ${Math.round(r.oldPrice)} ₽)` : ""} → ${r.url}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
