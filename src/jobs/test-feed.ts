import { readFile } from "node:fs/promises";
import { parseYmlFeed } from "../lib/feeds/yml";

const xml = await readFile("fixtures/catalog.yml", "utf8");
const first = parseYmlFeed(xml, "test-yml");
const second = parseYmlFeed(xml, "test-yml");

if (first.products.length !== 3) {
  throw new Error(`Expected 3 products, got ${first.products.length}`);
}
if (second.products.length !== 3) {
  throw new Error(`Repeat import parsed ${second.products.length} products instead of 3`);
}

const ids = new Set(first.products.map((product) => `${product.source}:${product.externalId}`));
if (ids.size !== 3) throw new Error("Duplicate source + offer_id detected");

const shirt = first.products.find((product) => product.externalId === "shirt-boy-104");
if (!shirt || shirt.price !== 1290 || shirt.oldPrice !== 1990 || shirt.ageLabel !== "3-4 года") {
  throw new Error("YML field mapping failed for shirt-boy-104");
}

const invalidOldPrice = `<yml_catalog><shop><offers><offer id="x"><url>https://example.com/x</url><price>1000</price><oldprice>900</oldprice><name>Test</name></offer></offers></shop></yml_catalog>`;
const invalid = parseYmlFeed(invalidOldPrice, "test-yml").products[0];
if (!invalid || invalid.oldPrice !== null) {
  throw new Error("oldprice validation failed");
}

console.log("Feed importer test passed: 3 products, stable source+offer_id, price/oldprice/params mapped.");
