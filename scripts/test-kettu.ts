import { searchViaKettu } from "../src/lib/kettu-search";

async function main() {
  const query = process.argv[2] || "кроссовки детские";
  const results = await searchViaKettu(query, 5);
  console.log(JSON.stringify(results, null, 2));
  console.log(`total: ${results.length}`);
}

main();
