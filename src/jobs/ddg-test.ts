import { searchDuckDuckGo } from "../lib/web-search-free";

async function main() {
  const query = process.argv[2] || "кроссовки девочке 30 размер купить";
  console.log("Query:", query);
  const results = await searchDuckDuckGo(query, 10);
  console.log("Results:", results.length);
  for (const r of results.slice(0, 10)) {
    console.log(`- [${r.source}] ${r.title} — ${r.price ? Math.round(r.price) + " ₽" : "цена на сайте"} → ${r.url}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
