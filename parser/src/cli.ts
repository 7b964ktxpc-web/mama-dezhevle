import { MarketplaceParser, comparePrices } from "./engine";

function argValues(argv: string[], name: string): string[] {
  const values: string[] = [];
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === name && argv[i + 1]) values.push(argv[i + 1]);
  }
  return values;
}

async function main() {
  const urls = argValues(process.argv.slice(2), "--url");
  if (!urls.length) {
    console.error("Usage: npx tsx parser/src/cli.ts --url <https://marketplace/...> [--url <...>]");
    process.exit(1);
  }

  const parser = new MarketplaceParser();
  const products = await parser.parse(urls);
  const comparisons = comparePrices(products);

  process.stdout.write(JSON.stringify({
    collectedAt: new Date().toISOString(),
    urls,
    products,
    comparisons,
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
