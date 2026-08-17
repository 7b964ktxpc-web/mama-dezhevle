import { execFileSync } from "node:child_process";

execFileSync("npx", ["tsc", "--noEmit"], { stdio: "inherit", shell: process.platform === "win32" });
