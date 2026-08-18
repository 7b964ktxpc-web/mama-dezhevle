import { execFileSync } from "node:child_process";

execFileSync("npx", ["tsc", "-p", "parser/tsconfig.build.json", "--noEmit"], {
  stdio: "inherit",
  shell: process.platform === "win32",
});
