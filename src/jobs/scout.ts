import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

function loadDotEnv() {
  const file = join(process.cwd(), ".env");
  if (!existsSync(file)) return;
  for (const line of readFileSync(file, "utf8").split("\n")) {
    const m = line.match(/^\s*([\w.-]+)\s*=\s*(.*)\s*$/);
    if (!m) continue;
    if (process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}
loadDotEnv();
import { scoutSweepOnce, scoutIntervalMs } from "../lib/scout-worker";

async function runLoop() {
  while (true) {
    const started = new Date().toISOString();
    console.log(JSON.stringify({ event: "scout_sweep_start", at: started }));
    try {
      await scoutSweepOnce();
    } catch (error) {
      console.error("scout sweep failed", error);
    }
    await new Promise((resolve) => setTimeout(resolve, scoutIntervalMs()));
  }
}

runLoop().catch((error) => {
  console.error(error);
  process.exit(1);
});
