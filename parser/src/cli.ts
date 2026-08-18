import { readFile } from "node:fs/promises";
import { MarketplaceParser, comparePrices } from "./engine";
import { extractProducts } from "./product-extractor";
import { fixtureToParsedProduct } from "./fixtures/to-parsed-product";
import { filterChildProducts } from "./children";

function argValues(argv: string[], name: string): string[] {
  const values: string[] = [];
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === name && argv[i + 1]) values.push(argv[i + 1]);
  }
  return values;
}

async function main() {
  const argv = process.argv.slice(2);
  const urls = argValues(argv, "--url");
  const files = argValues(argv, "--html-file");
  const allProducts = argv.includes("--all-products");
  if (!urls.length && !files.length) {
    console.error("Usage: npx tsx parser/src/cli.ts --url <https://marketplace/...> [--url <...>] | --html-file <file> [--all-products]");
    process.exit(1);
  }

  let products: Awaited<ReturnType<MarketplaceParser["parse"]>>;
  if (files.length) {
    const fixtureProducts = [];
    for (const file of files) {
      const html = await readFile(file, "utf8");
      const extracted = extractProducts(html, `file://${file}`);
      fixtureProducts.push(...extracted.map((item, index) => fixtureToParsedProduct(item, "fixture", `file-${index}`, `file://${file}`)));
    }
    products = allProducts ? fixtureProducts : filterChildProducts(fixtureProducts);
  } else {
    const parser = new MarketplaceParser({ childrenOnly: !allProducts });
    products = await parser.parse(urls);
  }

  const comparisons = comparePrices(products);
  process.stdout.write(JSON.stringify({ collectedAt: new Date().toISOString(), urls, files, childrenOnly: !allProducts, products, comparisons }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
