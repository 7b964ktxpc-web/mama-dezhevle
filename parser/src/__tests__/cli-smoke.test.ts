import { execFileSync } from "node:child_process";
import { resolve } from "node:path";

describe("parser CLI smoke", () => {
  it("returns structured JSON for a public fixture URL", () => {
    const fixture = resolve(process.cwd(), "parser/src/fixtures/ozon-product.html");
    const script = resolve(process.cwd(), "parser/src/cli.ts");
    const output = execFileSync("npx", ["tsx", script, "--url", `https://www.ozon.ru/product/example?fixture=${encodeURIComponent(fixture)}`], { encoding: "utf8" });
    const parsed = JSON.parse(output);
    expect(parsed).toHaveProperty("products");
    expect(parsed).toHaveProperty("comparisons");
    expect(Array.isArray(parsed.products)).toBe(true);
    expect(Array.isArray(parsed.comparisons)).toBe(true);
  });
});
