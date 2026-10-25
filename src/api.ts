// The only way the UI reaches Arena: the bundled arena-engine sidecar (Arena's logic
// lives in glyph-engine, src/arena). In the app this goes through Tauri; in a browser
// during development it goes through scripts/dev-bridge.ts on localhost.

export type TaskKind = "drafting" | "decision" | "research" | "planning" | "video_script" | "coding" | "general";
export type Weight = "light" | "middle" | "heavy";
export interface League { domain: string; kind: TaskKind | "*"; weight: Weight | "*" }

export interface Recipe {
  id: string; label: string; cli: string; model: string; baseUrl?: string;
  prompt: "plain" | "concise" | "expert"; context: "none" | "domain"; tools: "none" | "web";
  active?: boolean; source?: string;
}
export interface Route {
  domain: string; kind: TaskKind | "*"; weight: Weight | "*"; recipe: string; cli: string; model: string;
  prompt: string; context: string; tools: string; verdict: "best" | "equivalent_cheaper" | "home_only" | "provisional";
  why: string; confidence: number; games: number; runner_up?: string; updated_at: string;
}
export interface Suspension { model: string; domain: string; until: string; why: string }
export interface Policy {
  schema: string; generated_at: string; generator: string; routes: Route[]; suspended: Suspension[]; home_only: string[];
  budget: { month: string; cap_usd: number; spent_usd: number };
  unblinding: { picks: number; agree: number; score: number | null };
}
export interface Config {
  monthly_cap_usd: number; home_only: string[]; home_endpoints: string[]; home_hosts: string[];
  replay_sample: number; min_games: number; sentinel_day: number; judge: string; code_tests: boolean;
}
export interface Status {
  vault_ok: boolean; arena_dir: string; generator: string; config: Config; recipes: Recipe[]; home_recipes: string[];
  policy: Policy | null; budget: { month: string; cap_usd: number; spent_usd: number };
  counts: { duels: number; decided: number; pending: number; errors: number; picks: number; adverse: number };
  leagues: { league: League; duels: number; decided: number; pending: number }[];
  suspended: Suspension[]; sentinel_due: boolean; studio_policy_path: string; domains: string[];
}
export interface SideBrief { recipe: string; ok: boolean; status?: string; error?: string; ms: number; cost_usd: number; check?: { pass: boolean; detail: string }; judge?: number | null; chars: number }
export interface DuelBrief {
  id: string; ts: number; league: League; task: { id: string; source: string; prompt: string };
  a: SideBrief; b: SideBrief; similarity: number; outcome: "a" | "b" | "tie" | "pending" | "error";
  decided_by: string; pick?: { winner: string; ms: number; left: string; ts: number };
}
export interface Card { duel: string; league: League; prompt: string; left: "a" | "b"; left_text: string; right_text: string; queue: number }
export interface Reveal {
  duel: string; winner: string | null; loser: string | null; tie: boolean;
  a: { recipe: string; label: string; cost_usd: number; ms: number }; b: { recipe: string; label: string; cost_usd: number; ms: number };
  routed: string | null; agrees_with_policy: boolean | null; unblinding: Policy["unblinding"];
}
export interface Standing { recipe: string; wins: number; losses: number; ties: number; games: number; rate: number; lower: number; cost_avg: number; ms_avg: number }
export interface AdverseEvent { ts: number; model: string; domain: string; severity: "minor" | "major" | "severe"; kind: string; what: string; source: string; duel?: string }
export interface Runtime { cli: string; label: string; models: string[]; baseUrl?: string; local: boolean }
export interface Scouted { cli: string; model: string; base_url?: string; label: string; why: string; source: "local" | "web" }
export interface Progress { event: "progress"; done: number; total: number; note?: string; duel?: DuelBrief }

type TauriCore = { invoke: <T>(cmd: string, args?: Record<string, unknown>) => Promise<T> };
const inTauri = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
const BRIDGE = "http://localhost:1431";

async function core(): Promise<TauriCore> {
  return (await import("@tauri-apps/api/core")) as unknown as TauriCore;
}

/** Run one arena command; resolves with its JSON, rejects with its error text. */
export async function arena<T>(args: string[]): Promise<T> {
  let out: unknown;
  if (inTauri) out = await (await core()).invoke("arena", { args });
  else {
    const res = await fetch(`${BRIDGE}/arena`, { method: "POST", body: JSON.stringify({ args }) });
    out = await res.json();
  }
  if (out && typeof out === "object" && "error" in (out as object) && Object.keys(out as object).length === 1) {
    throw new Error(String((out as { error: unknown }).error));
  }
  return out as T;
}

/** A long command (replay, sentinel) with progress lines; resolves with the final result. */
export async function arenaStream<T>(args: string[], onProgress: (p: Progress) => void): Promise<T> {
  if (inTauri) {
    const { Channel } = (await import("@tauri-apps/api/core")) as unknown as { Channel: new <M>() => { onmessage: (m: M) => void } };
    const ch = new Channel<string>();
    ch.onmessage = (line: string) => {
      try {
        const e = JSON.parse(line);
        if (e.event === "progress") onProgress(e);
      } catch { /* not JSON */ }
    };
    const res = await (await core()).invoke<{ event?: string; result?: T; error?: string }>("arena_stream", { args: [...args, "--stream"], onLine: ch });
    if (res?.event === "error" || res?.error) throw new Error(res.error ?? "failed");
    return res.result as T;
  }
  const res = await fetch(`${BRIDGE}/stream`, { method: "POST", body: JSON.stringify({ args: [...args, "--stream"] }) });
  const reader = res.body!.getReader();
  const dec = new TextDecoder();
  let buf = "";
  let final: { result?: T; error?: string } | null = null;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    let i: number;
    while ((i = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, i);
      buf = buf.slice(i + 1);
      if (!line.trim()) continue;
      const e = JSON.parse(line);
      if (e.event === "progress") onProgress(e);
      else if (e.event === "done" || e.event === "error") final = e;
    }
  }
  if (!final || final.error) throw new Error(final?.error ?? "no result");
  return final.result as T;
}

export async function openExternal(url: string): Promise<void> {
  if (inTauri) {
    const { openUrl } = await import("@tauri-apps/plugin-opener");
    await openUrl(url);
  } else window.open(url, "_blank");
}

export async function providerKeys(): Promise<Record<string, boolean>> {
  if (!inTauri) return { openai: true, anthropic: false };
  return (await core()).invoke("provider_keys");
}
export async function setProviderKey(provider: string, key: string): Promise<void> {
  if (!inTauri) return;
  await (await core()).invoke("set_provider_key", { provider, key });
}
export async function vaultInfo(): Promise<{ path: string | null; source: string }> {
  if (!inTauri) return { path: "~/Vaults/demo", source: "dev bridge" };
  return (await core()).invoke("vault_info");
}
export async function chooseVault(): Promise<string | null> {
  if (!inTauri) return null;
  const { open } = await import("@tauri-apps/plugin-dialog");
  const dir = await open({ directory: true, title: "Choose your vault folder" });
  if (typeof dir !== "string") return null;
  await (await core()).invoke("set_vault", { path: dir });
  return dir;
}
