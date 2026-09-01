import { SOURCE_DEFS, callKettu } from "../src/lib/kettu-gateway";

type Selfcheck = { status?: string; checks?: Record<string, { state?: string; detail?: string }> };

async function main() {
  if (!process.env.KETTU_DIR) {
    console.error("KETTU_DIR is not set. Example: KETTU_DIR=C:\\Users\\...\\kettu-marketplace-mcp");
    process.exit(1);
  }
  const chrome = process.env.KETTU_CHROME === "1";
  console.log("Source health check (real requests, not README):\n");
  for (const def of SOURCE_DEFS) {
    if (def.needsChrome && !chrome) {
      console.log(`⚠️  ${def.label.padEnd(16)} требует браузер (Kettu CDP). Включи: KETTU_CHROME=1 + запущенный Chrome с --remote-debugging-port`);
      continue;
    }
    const t0 = Date.now();
    try {
      const res = await callKettu<Selfcheck>(def.selfcheckTool, {}, 60000);
      const ms = Date.now() - t0;
      if (!res) {
        console.log(`🔴 ${def.label.padEnd(16)} недоступен (пустой ответ) [${ms}ms]`);
      } else if (res.status === "success") {
        const partial = def.id === "detmir" ? " — только категории/карточки, текстового поиска нет" : "";
        const icon = def.id === "detmir" || (res.checks && Object.values(res.checks).some((c) => c.state !== "healthy")) ? "🟡" : "🟢";
        console.log(`${icon} ${def.label.padEnd(16)} ${res.status} [${ms}ms]${partial}`);
      } else {
        console.log(`🟡 ${def.label.padEnd(16)} ${res.status} [${ms}ms] ${JSON.stringify(res.checks ?? {}).slice(0, 120)}`);
      }
    } catch (error) {
      console.log(`🔴 ${def.label.padEnd(16)} ошибка: ${String(error).slice(0, 140)}`);
    }
  }
}

main();
