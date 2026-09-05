import { spawn } from "node:child_process";

/** Runs the AI sidecar and the Vite dev server together, prefixing their output. */
const procs = [
  { name: "ai ", cmd: "npx", args: ["tsx", "backend/server/ai.ts"] },
  { name: "web", cmd: "npm", args: ["--prefix", "frontend", "run", "dev"] },
];

for (const p of procs) {
  const child = spawn(p.cmd, p.args, { stdio: ["ignore", "pipe", "pipe"], shell: process.platform === "win32" });
  const tag = (line: string) => `[${p.name}] ${line}`;
  child.stdout.on("data", (d) => process.stdout.write(String(d).split("\n").filter(Boolean).map(tag).join("\n") + "\n"));
  child.stderr.on("data", (d) => process.stderr.write(String(d).split("\n").filter(Boolean).map(tag).join("\n") + "\n"));
  child.on("exit", (code) => { console.log(`[${p.name}] exited ${code}`); process.exit(code ?? 0); });
}
