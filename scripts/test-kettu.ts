import { gatewaySearch } from "../src/lib/kettu-gateway";

async function main() {
  const query = process.argv[2] || "конструктор лего 42171";
  const t0 = Date.now();
  const result = await gatewaySearch(query, {
    limit: 8,
    onEvent: (e) => console.log(`[${String(Math.floor((Date.now() - t0) / 1000)).padStart(2, "0")}s] ${e.type} ${JSON.stringify(e).slice(0, 140)}`),
  });
  console.log(`\n=== ${result.groups.length} групп из ${result.offers.length} предложений (${result.durationMs}ms, cache=${result.fromCache}) ===`);
  for (const group of result.groups.slice(0, 6)) {
    console.log(`\n📦 ${group.title.slice(0, 70)} [${group.offers.length} предложений, медиана ${Math.round(group.medianPrice)}₽]`);
    for (const offer of group.offers.slice(0, 4)) {
      console.log(`   ${offer.source.padEnd(14)} ${String(offer.effectivePrice).padStart(6)}₽${offer.oldPrice ? ` (было ${Math.round(offer.oldPrice)}₽)` : ""} score=${offer.dealScore ?? "-"} verified=${offer.verificationStatus}`);
    }
  }
}

main();
