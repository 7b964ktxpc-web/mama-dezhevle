import { execFileSync } from "node:child_process";
import { resolve } from "node:path";

describe("parser CLI smoke", () => {
  it("returns structured JSON for a local HTML fixture", () => {
    const fixture = resolve(process.cwd(), "parser/src/fixtures/ozon-product.html");
    const script = resolve(process.cwd(), "parser/src/cli.ts");
    const output = execFileSync("npx", ["tsx", script, "--html-file", fixture], { encoding: "utf8" });
    const parsed = JSON.parse(output);
    expect(parsed).toHaveProperty("products");
    expect(parsed).toHaveProperty("comparisons");
    expect(parsed.products).toHaveLength(1);
    expect(parsed.products[0].price).toBe(1299);
    expect(Array.isArray(parsed.comparisons)).toBe(true);
  });
});
