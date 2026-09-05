import { spawn } from "node:child_process";
import { resolve } from "node:path";

/** Runs the AI sidecar and the frontend dev server together, prefixing their output. */
const here = resolve(__dirname);
const procs = [
  { name: "ai ", cmd: "npx", args: ["tsx", "server/ai.ts"], cwd: here },
  { name: "web", cmd: "npm", args: ["run", "dev"], cwd: resolve(here, "../frontend") },
];
for (const p of procs) {
  const child = spawn(p.cmd, p.args, { cwd: p.cwd, stdio: ["ignore", "pipe", "pipe"], shell: process.platform === "win32" });
  const tag = (line: string) => `[${p.name}] ${line}`;
  child.stdout.on("data", (d) => process.stdout.write(String(d).split("\n").filter(Boolean).map(tag).join("\n") + "\n"));
  child.stderr.on("data", (d) => process.stderr.write(String(d).split("\n").filter(Boolean).map(tag).join("\n") + "\n"));
  child.on("exit", (code) => { console.log(`[${p.name}] exited ${code}`); process.exit(code ?? 0); });
}
