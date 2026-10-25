// A made-up vault for screenshots, demos and UI work: a fictional person who writes a
// small trail-running newsletter, builds little tools and plans trips. Nothing in it is
// real. Writes the same plain files Arena writes, then the sidecar rebuilds the policy.
//   node scripts/demo-vault.mjs /tmp/arena-demo-vault
import { execFileSync } from "node:child_process";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const out = process.argv[2];
if (!out) { console.error("usage: node scripts/demo-vault.mjs <empty folder>"); process.exit(1); }
rmSync(out, { recursive: true, force: true });
const arena = join(out, "build", "_meta", "arena");
mkdirSync(arena, { recursive: true });
for (const d of ["content", "dev", "learning", "travel", "health", "money", "general"]) {
  mkdirSync(join(out, "data", "domains", d, "memory"), { recursive: true });
  writeFileSync(join(out, "data", "domains", d, "ideal-state.md"), `# ${d}\n\nA made-up demo domain.\n`);
}

let seed = 42;
const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
const now = Date.now();
const DAY = 86_400_000;

const R = (id, label, cli, model, extra = {}) => ({ id, label, cli, model, prompt: "plain", context: "none", tools: "none", active: true, source: "default", ...extra });
const recipes = [
  R("claude-opus-5.5", "Opus 5.5", "claude", "claude-opus-5-5"),
  R("claude-sonnet-5", "Sonnet 5", "claude", "claude-sonnet-5"),
  R("claude-sonnet-5-ctx", "Sonnet 5 + vault", "claude", "claude-sonnet-5", { context: "domain" }),
  R("claude-haiku-4-5-concise", "Haiku 4.5 concise", "claude", "claude-haiku-4-5", { prompt: "concise" }),
  R("codex-gpt-6-sol", "GPT-6 Sol", "codex", "gpt-6-sol"),
  R("codex-gpt-6-luna", "GPT-6 Luna", "codex", "gpt-6-luna"),
  R("ollama-qwen3-8b", "qwen3:8b", "ollama", "qwen3:8b", { baseUrl: "http://localhost:11434" }),
  R("ollama-gemma3-12b", "gemma3:12b", "ollama", "gemma3:12b", { baseUrl: "http://localhost:11434" }),
];
writeFileSync(join(arena, "recipes.json"), JSON.stringify(recipes, null, 2));
const COST = { "claude-opus-5.5": 0.0152, "claude-sonnet-5": 0.0076, "claude-sonnet-5-ctx": 0.0091, "claude-haiku-4-5-concise": 0.0031, "codex-gpt-6-sol": 0.0078, "codex-gpt-6-luna": 0.0004, "ollama-qwen3-8b": 0, "ollama-gemma3-12b": 0 };
const MS = { "claude-opus-5.5": 14000, "claude-sonnet-5": 8200, "claude-sonnet-5-ctx": 9100, "claude-haiku-4-5-concise": 3100, "codex-gpt-6-sol": 11000, "codex-gpt-6-luna": 2600, "ollama-qwen3-8b": 21000, "ollama-gemma3-12b": 26000 };

const PROMPTS = {
  "content|drafting": ["Write a two-sentence intro for this week's newsletter about the river trail reopening.", "Draft a friendly reply to a reader who asks which shoes to use on muddy trails.", "Rewrite this headline so it is shorter: Ten things to pack for a spring trail race.", "Write a caption for a photo of the lake loop at sunrise."],
  "content|video_script": ["Write a 60-second video script about running your first trail 10K.", "Script the opening scene for a video about the canyon loop."],
  "dev|coding": ["Write a function that parses GPX files and returns total elevation gain.", "Fix this TypeScript function that throws on an empty array.", "Write unit tests for a slugify helper.", "Refactor this script to read the config once instead of on every call."],
  "learning|research": ["Compare spaced repetition apps for learning Spanish vocabulary.", "Find good sources on how altitude affects running pace."],
  "travel|planning": ["Plan a three-day trip to a national park in late October.", "Make a packing checklist for a two-night hut trip.", "Plan a weekend itinerary around a half marathon in another city."],
  "general|decision": ["Should I buy a GPS watch now or wait for the spring models?", "Is it worth paying for a newsletter platform or staying on the free tier?"],
  "health|planning": ["Plan a gentle four-week return to running after a sprained ankle.", "Make a weekly stretching routine for after long runs."],
  "money|decision": ["Should the newsletter fund go into a savings account or a short CD?", "Reconcile these three race-entry refunds against the bank export."],
};
const WEIGHT = { "content|drafting": ["light", "middle"], "content|video_script": ["heavy"], "dev|coding": ["heavy", "light"], "learning|research": ["middle"], "travel|planning": ["middle", "light"], "general|decision": ["middle"], "health|planning": ["light"], "money|decision": ["middle"] };

// [league, a, b, [a wins, b wins, ties], decided_by mix]
const PLAN = [
  ["content|drafting", "claude-opus-5.5", "claude-sonnet-5", [3, 3, 9], ["agree", "pick"]],
  ["content|drafting", "claude-sonnet-5", "claude-haiku-4-5-concise", [7, 3, 2], ["pick", "agree"]],
  ["content|video_script", "claude-opus-5.5", "claude-sonnet-5", [8, 2, 1], ["pick"]],
  ["dev|coding", "claude-opus-5.5", "codex-gpt-6-sol", [9, 3, 2], ["check", "pick"]],
  ["dev|coding", "claude-haiku-4-5-concise", "claude-sonnet-5", [3, 3, 6], ["check"]],
  ["learning|research", "claude-sonnet-5-ctx", "codex-gpt-6-sol", [3, 7, 2], ["pick"]],
  ["travel|planning", "codex-gpt-6-luna", "claude-haiku-4-5-concise", [4, 3, 6], ["agree", "pick"]],
  ["general|decision", "claude-opus-5.5", "claude-sonnet-5", [6, 2, 2], ["judge", "pick"]],
  ["health|planning", "ollama-qwen3-8b", "ollama-gemma3-12b", [7, 2, 2], ["pick", "check"]],
  ["money|decision", "ollama-qwen3-8b", "ollama-gemma3-12b", [4, 3, 5], ["check"]],
];

const duels = [];
const picks = [];
let n = 0;
const side = (recipe, reply = "(answer kept in the duel file)") => ({ recipe, ok: true, reply, ms: Math.round(MS[recipe] * (0.7 + rnd() * 0.6)), cost_usd: COST[recipe] });
for (const [lg, a, b, [wa, wb, wt], by] of PLAN) {
  const [domain, kind] = lg.split("|");
  const outcomes = [...Array(wa).fill("a"), ...Array(wb).fill("b"), ...Array(wt).fill("tie")].sort(() => rnd() - 0.5);
  for (const o of outcomes) {
    n++;
    const ts = now - Math.round((2 + rnd() * 20) * DAY);
    const prompt = PROMPTS[lg][n % PROMPTS[lg].length];
    const weight = WEIGHT[lg][n % WEIGHT[lg].length];
    let decided = o === "tie" && by.includes("agree") ? "agree" : by[n % by.length];
    if (decided === "agree" && o !== "tie") decided = "pick";
    const d = {
      id: `d-demo-${n}`, ts, task: { id: `ghost-demo-${n}`, source: decided === "judge" ? "canonical" : "ghost", domain, kind, weight, prompt },
      league: { domain, kind, weight }, a: side(a), b: side(b), similarity: decided === "agree" ? 0.62 + rnd() * 0.2 : 0.1 + rnd() * 0.3,
      outcome: o, decided_by: decided,
    };
    if (decided === "check") { d.a.check = { pass: o !== "b", detail: o !== "b" ? "tests pass" : "tests fail" }; d.b.check = { pass: o !== "a", detail: o !== "a" ? "tests pass" : "tests fail" }; }
    if (decided === "pick") {
      const left = rnd() < 0.5 ? "a" : "b";
      d.pick = { winner: o, ms: Math.round(1300 + rnd() * 1900), left, ts: ts + 3600_000 };
      picks.push({ ts: d.pick.ts, duel: d.id, winner: o, left, ms: d.pick.ms });
    }
    duels.push(d);
  }
}
// Two duels a provider failed: not scored, re-run later.
duels.push({ id: "d-demo-err1", ts: now - 3 * DAY, task: { id: "ghost-demo-err1", source: "ghost", domain: "dev", kind: "coding", weight: "light", prompt: "Write a regex that matches ISO dates." }, league: { domain: "dev", kind: "coding", weight: "light" }, a: side("claude-sonnet-5"), b: { recipe: "codex-gpt-6-luna", ok: false, status: "error", error: "codex: usage limit reached", reply: "", ms: 900, cost_usd: 0 }, similarity: 0, outcome: "error", decided_by: "none" });

// Waiting for a blind pick: real answers so the Picks screen shows something to read.
const PENDING = [
  ["content", "drafting", "light", "Write a two-sentence intro for this week's newsletter: the river trail reopens Saturday after the bridge repair.", "claude-sonnet-5", "claude-opus-5.5",
    "Good news for Saturday morning: the river trail is open again, and the new bridge is solid, wide and dry. Lace up early, because half the town has been waiting for this one.",
    "After six weeks of detours, the river trail reopens this Saturday with a rebuilt bridge at the halfway point. This issue covers what changed, where the new mile markers are, and the best loop to celebrate."],
  ["learning", "research", "middle", "Compare spaced repetition apps for learning Spanish vocabulary. Which one fits ten minutes a day?", "codex-gpt-6-sol", "claude-sonnet-5-ctx",
    "For ten minutes a day, pick the app that schedules for you and keeps sessions short.\n\n- Anki: the most control and free on desktop, but setup takes time and the decks vary in quality.\n- Clozemaster: sentences in context, good once you know about 500 words.\n- A course app with built-in review: the least setup, the least control.\n\nIf you will not tinker, start with a course app and add Anki for the words you keep missing.",
    "Anki is the strongest choice if you can live with a little setup: a shared Spanish frequency deck plus a daily limit of 15 new cards fits in ten minutes. If you want zero setup, use a course app's review mode and accept less control over what comes back."],
  ["travel", "planning", "middle", "Plan a three-day trip to a national park in late October with one long hike.", "codex-gpt-6-luna", "claude-haiku-4-5-concise",
    "Day 1: arrive by early afternoon, short rim walk at sunset, check trail conditions at the visitor center.\nDay 2: the long hike, start at first light, 12 to 14 miles, pack layers for a 30 degree swing.\nDay 3: easy morning loop, scenic drive out, lunch in the gateway town.",
    "Late October means short days and cold mornings. Day 1, settle in and do a 3 mile loop. Day 2, the big hike: start at 7, turn around by 1 pm whatever happens, carry a headlamp. Day 3, rest the legs: a scenic drive and one viewpoint. Book lodging now; shoulder season still fills on weekends."],
];
for (const [i, [domain, kind, weight, prompt, a, b, ta, tb]] of PENDING.entries()) {
  duels.push({ id: `d-demo-open${i}`, ts: now - (i + 1) * 3600_000, task: { id: `ghost-demo-open${i}`, source: "ghost", domain, kind, weight, prompt }, league: { domain, kind, weight }, a: side(a, ta), b: side(b, tb), similarity: 0.18, outcome: "pending", decided_by: "none" });
}
duels.sort((x, y) => x.ts - y.ts);
writeFileSync(join(arena, "duels.jsonl"), duels.map((d) => JSON.stringify(d)).join("\n") + "\n");
writeFileSync(join(arena, "picks.jsonl"), picks.map((p) => JSON.stringify(p)).join("\n") + "\n");

const adverse = [
  { ts: now - 9 * DAY, model: "gemma3:12b", domain: "health", severity: "severe", kind: "unsafe_advice", what: "told a sprained ankle to run through the pain", source: "pick" },
  { ts: now - 6 * DAY, model: "gpt-6-luna", domain: "money", severity: "minor", kind: "wrong_number", what: "a refund total off by one entry", source: "check" },
  { ts: now - 4 * DAY, model: "gpt-6-sol", domain: "dev", severity: "major", kind: "hallucination", what: "invented a GPX library function", source: "pick" },
];
writeFileSync(join(arena, "adverse.jsonl"), adverse.map((e) => JSON.stringify(e)).join("\n") + "\n");
const spend = Array.from({ length: 40 }, (_, i) => ({ ts: now - Math.round(rnd() * 20 * DAY), usd: 0.04 + rnd() * 0.1, recipe: recipes[i % 6].id, model: recipes[i % 6].model }));
writeFileSync(join(arena, "spend.jsonl"), spend.map((s) => JSON.stringify(s)).join("\n") + "\n");
const sent = [];
for (const r of ["claude-sonnet-5", "claude-opus-5.5", "ollama-qwen3-8b"]) for (const t of ["sentinel-ledger", "sentinel-json", "sentinel-code", "sentinel-brief", "sentinel-date", "sentinel-format"]) sent.push({ ts: now - 2 * DAY, recipe: r, model: recipes.find((x) => x.id === r).model, task: t, pass: !(r === "ollama-qwen3-8b" && t === "sentinel-date"), detail: "" });
writeFileSync(join(arena, "sentinel.jsonl"), sent.map((s) => JSON.stringify(s)).join("\n") + "\n");
writeFileSync(join(arena, "config.json"), JSON.stringify({ monthly_cap_usd: 10, home_endpoints: ["http://localhost:11434"] }, null, 2));

// A captured prompt stream, as the harness hooks write it: ghost replays read these.
const typed = [
  "Draft a short note to newsletter readers about the new Saturday group run.",
  "Write a function that converts minutes per mile to minutes per kilometre, with tests.",
  "Should I switch the newsletter from weekly to every two weeks over the winter?",
  "Plan a four-day loop of the lakes region with two rest days.",
  "Research what the evidence says about strides before an easy run.",
  "Write a 45-second video script about choosing a headlamp.",
  "Summarize the pros and cons of a standing desk for someone who runs every morning.",
  "Rewrite this intro so it is warmer and shorter: Welcome to the October issue of the newsletter.",
];
mkdirSync(join(out, "build", "_meta", "prompts"), { recursive: true });
writeFileSync(join(out, "build", "_meta", "prompts", "claude.demo-laptop.jsonl"), typed.map((t, i) => JSON.stringify({ epoch_ms: now - (i + 1) * DAY, tool: "claude", host: "demo-laptop", session: `s${i}`, cwd: "/tmp", prompt: t })).join("\n") + "\n");

const bin = process.env.ARENA_ENGINE ?? new URL("../src-tauri/binaries/arena-engine-aarch64-apple-darwin", import.meta.url).pathname;
execFileSync(bin, ["policy", "rebuild", "--vault", out], { stdio: ["ignore", "ignore", "inherit"] });
console.log(`demo vault ready: ${out} (${duels.length} duels)`);
