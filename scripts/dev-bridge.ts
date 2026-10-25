// Development only: lets the UI run in a plain browser (vite on :1430) by forwarding
// arena commands to the sidecar on localhost:1431. The app itself never uses this.
//   ARENA_VAULT=/path/to/a/test/vault bun scripts/dev-bridge.ts
import { existsSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(import.meta.dir, "..");
const BIN = process.env.ARENA_ENGINE ?? join(ROOT, "src-tauri", "binaries", `arena-engine-${process.arch === "arm64" ? "aarch64" : "x86_64"}-apple-darwin`);
const VAULT = process.env.ARENA_VAULT;
if (!VAULT || !existsSync(VAULT)) {
  console.error("set ARENA_VAULT to a test vault (never your real one while developing)");
  process.exit(1);
}
if (!existsSync(BIN)) {
  console.error(`no sidecar at ${BIN}: run scripts/prepare-sidecar.sh`);
  process.exit(1);
}
const cors = { "access-control-allow-origin": "*", "access-control-allow-headers": "content-type" };
const allowed = /^[\w.:@/=,*+ ()$-]*$/;

function spawn(args: string[]) {
  if (!args.every((a) => typeof a === "string" && (allowed.test(a) || a.startsWith("{")))) throw new Error("bad args");
  return Bun.spawn([BIN, ...args, "--vault", VAULT!], { stdout: "pipe", stderr: "inherit", env: { ...process.env, PREVAIL_VAULT: VAULT } });
}

Bun.serve({
  port: 1431,
  // A local model can think for minutes between progress lines; keep the stream open.
  idleTimeout: 255,
  async fetch(req) {
    if (req.method === "OPTIONS") return new Response(null, { headers: cors });
    const url = new URL(req.url);
    const { args } = (await req.json()) as { args: string[] };
    const p = spawn(args);
    if (url.pathname === "/stream") return new Response(p.stdout, { headers: { ...cors, "content-type": "application/x-ndjson" } });
    const text = await new Response(p.stdout).text();
    const last = text.trim().split("\n").pop() || "null";
    return new Response(last, { headers: { ...cors, "content-type": "application/json" } });
  },
});
console.log(`dev bridge on :1431 -> ${VAULT}`);
