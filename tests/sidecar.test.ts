// End-to-end checks of the sidecar this app ships (arena-engine, built from glyph-engine
// src/arena), on the made-up demo vault. The engine has its own unit tests; these prove
// the binary inside the app keeps the promises the UI makes. No call leaves this Mac:
// every duel here is refused by the Home Only guard before anything is sent.
import { execFileSync } from "node:child_process";
import { appendFileSync, existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, test } from "vitest";

const ROOT = join(__dirname, "..");
const BIN = process.env.ARENA_ENGINE ?? join(ROOT, "src-tauri/binaries/arena-engine-aarch64-apple-darwin");
let vault = "";
const arenaDir = () => join(vault, "build/_meta/arena");
const lines = (f: string) => (existsSync(join(arenaDir(), f)) ? readFileSync(join(arenaDir(), f), "utf8").split("\n").filter(Boolean) : []);
const run = <T = any>(...args: string[]): T => JSON.parse(execFileSync(BIN, [...args, "--vault", vault], { encoding: "utf8", env: { ...process.env, PREVAIL_VAULT: "" } }).trim().split("\n").pop()!);

beforeAll(() => {
  if (!existsSync(BIN)) throw new Error(`no sidecar at ${BIN}: run scripts/prepare-sidecar.sh`);
  vault = mkdtempSync(join(tmpdir(), "arena-test-"));
  execFileSync("node", [join(ROOT, "scripts/demo-vault.mjs"), vault], { env: { ...process.env, ARENA_ENGINE: BIN }, stdio: "ignore" });
});
afterAll(() => rmSync(vault, { recursive: true, force: true }));

describe("privacy guard: health and money never reach a cloud model", () => {
  test("a health duel on two cloud recipes is refused on both sides, nothing spent", () => {
    const spend = lines("spend.jsonl").length;
    const d = run("duel", "--domain", "health", "--prompt", "Plan a gentle return to running after an ankle sprain.", "--a", "claude-sonnet-5", "--b", "codex-gpt-6-luna");
    for (const s of [d.a, d.b]) {
      expect(s.ok).toBe(false);
      expect(s.status).toBe("privacy");
      expect(s.cost_usd).toBe(0);
      expect(s.chars).toBe(0);
    }
    expect(d.outcome).toBe("error");
    expect(lines("spend.jsonl").length).toBe(spend);
  });

  test("a money duel is refused the same way", () => {
    const d = run("duel", "--domain", "money", "--prompt", "Reconcile these refunds against the bank export.", "--a", "claude-opus-5.5", "--b", "claude-haiku-4-5-concise");
    expect([d.a.status, d.b.status]).toEqual(["privacy", "privacy"]);
  });

  test("a prompt with no domain that reads as health is Home Only too", () => {
    const d = run("duel", "--prompt", "What dose of my blood pressure medication should I take tonight?", "--a", "claude-sonnet-5", "--b", "codex-gpt-6-sol");
    expect([d.a.status, d.b.status]).toEqual(["privacy", "privacy"]);
  });

  test("tasks offered for a Home Only league are marked, and the policy routes them only to local recipes", () => {
    const p = run("policy");
    const local = new Set(run<any[]>("recipes").filter((r) => r.cli === "ollama").map((r) => r.id));
    const home = p.routes.filter((r: any) => p.home_only.includes(r.domain));
    expect(home.length).toBeGreaterThan(0);
    for (const r of home) {
      expect(local.has(r.recipe)).toBe(true);
      expect(r.verdict).toBe("home_only");
    }
    expect(run("policy", "route", "--domain", "health", "--kind", "coding", "--weight", "heavy").route?.cli ?? "ollama").toBe("ollama");
  });

  test("a refused duel is an error, never a loss, so it cannot change standings", () => {
    const before = run("league", "--domain", "health", "--kind", "planning").standings;
    run("duel", "--domain", "health", "--kind", "planning", "--prompt", "Make a stretching routine.", "--a", "claude-sonnet-5", "--b", "codex-gpt-6-luna");
    expect(run("league", "--domain", "health", "--kind", "planning").standings).toEqual(before);
  });
});

describe("scoring", () => {
  test("standings are ranked by the Wilson lower bound, ties count half", () => {
    const { standings } = run("league", "--domain", "content", "--kind", "drafting");
    expect(standings.length).toBeGreaterThan(1);
    for (const s of standings) {
      expect(s.games).toBe(s.wins + s.losses + s.ties);
      expect(s.rate).toBeCloseTo((s.wins + s.ties / 2) / s.games, 2);
      expect(s.lower).toBeLessThanOrEqual(s.rate);
    }
    const lows = standings.map((s: any) => s.lower);
    expect([...lows].sort((a, b) => b - a)).toEqual(lows);
  });

  test("an even pair routes to the cheaper recipe", () => {
    const r = run("policy", "route", "--domain", "content", "--kind", "drafting", "--weight", "light").route;
    expect(r.verdict).toBe("equivalent_cheaper");
    expect(r.recipe).toBe("claude-sonnet-5");
    expect(r.why).toMatch(/cheaper/);
  });
});

describe("the app reads the sidecar over a pipe", () => {
  test("an answer far past a pipe's 64 KB buffer arrives whole", () => {
    // The app runs the sidecar as a child process and parses its stdout. A pipe
    // takes 64 KB before it blocks, so an entry point that exits without waiting
    // hands the app half a JSON document. 400 captured prompts are ~230 KB.
    const stream = join(vault, "build/_meta/prompts/claude.demo-laptop.jsonl");
    const now = Date.now();
    const filler = Array.from({ length: 400 }, (_, i) => JSON.stringify({
      epoch_ms: now - (i + 1) * 60_000, tool: "claude", host: "demo-laptop", session: `big${i}`, cwd: "/tmp",
      prompt: `Draft a short note about trail number ${i}. ${"Keep it plain and concrete. ".repeat(12)}`,
    })).join("\n") + "\n";
    appendFileSync(stream, filler);
    const raw = execFileSync(BIN, ["tasks", "--source", "ghost", "--limit", "400", "--vault", vault], {
      encoding: "utf8", maxBuffer: 64 * 1024 * 1024, env: { ...process.env, PREVAIL_VAULT: "" },
    });
    expect(raw.length).toBeGreaterThan(80_000);
    const tasks = JSON.parse(raw.trim());
    expect(Array.isArray(tasks)).toBe(true);
    expect(tasks.length).toBeGreaterThan(100);
  });
});

describe("policy writer", () => {
  test("policy.json follows glyph-arena/policy@1, sorted, with a why on every route, and policy.md beside it", () => {
    const p = JSON.parse(readFileSync(join(arenaDir(), "policy.json"), "utf8"));
    expect(p.schema).toBe("glyph-arena/policy@1");
    expect(p.generator).toMatch(/^Glyph Arena /);
    const keys = p.routes.map((r: any) => `${r.domain}|${r.kind}|${r.weight}`);
    expect([...keys].sort()).toEqual(keys);
    expect(new Set(keys).size).toBe(keys.length);
    for (const r of p.routes) {
      expect(r.why.length).toBeGreaterThan(10);
      expect(r.games).toBeGreaterThanOrEqual(3);
    }
    expect(p.budget.cap_usd).toBe(10);
    expect(readFileSync(join(arenaDir(), "policy.md"), "utf8")).toMatch(/content/);
  });

  test("lookup falls back from the exact league to wider ones", () => {
    const r = run("policy", "route", "--domain", "content", "--kind", "planning", "--weight", "heavy").route;
    expect(r).toBeTruthy();
    expect([r.domain, r.kind]).toEqual(["content", "*"]);
  });

  test("a severe adverse event suspends the model in that domain and takes its routes away", () => {
    run("adverse", "add", "--model", "claude-opus-5-5", "--domain", "dev", "--severity", "severe", "--kind", "hallucination", "--what", "made up an API");
    const p = run("policy");
    // the event names the model id, which every recipe on that model shares
    const opus = run<any[]>("recipes").filter((x) => x.model === "claude-opus-5-5").map((x) => x.id);
    expect(p.suspended.some((s: any) => s.model === "claude-opus-5-5" && s.domain === "dev")).toBe(true);
    expect(p.routes.filter((r: any) => r.domain === "dev" && opus.includes(r.recipe))).toEqual([]);
  });
});
