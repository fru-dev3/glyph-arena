import { Check, FolderOpen, KeyRound, Monitor, Moon, Radar, Sun } from "lucide-react";
import { useEffect, useState } from "react";
import { arena, arenaStream, chooseVault, openExternal, providerKeys, setProviderKey, vaultInfo, type Config } from "../api";
import { useArena } from "../App";
import { applyTheme } from "../theme";
import { Button, Chip, Field, PageHeader, Section, Segmented, Select } from "../ui";

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const PROVIDERS = [["anthropic", "Anthropic"], ["openai", "OpenAI"], ["google", "Google AI"], ["openrouter", "OpenRouter"], ["xai", "xAI"], ["deepseek", "DeepSeek"], ["kimi", "Kimi"]] as const;
const list = (s: string) => s.split(",").map((x) => x.trim()).filter(Boolean);

export function SettingsScreen() {
  const { status, reload } = useArena();
  const s = status!;
  const [c, setC] = useState<Config>(s.config);
  const [saved, setSaved] = useState(false);
  const [theme, setTheme] = useState(() => { try { return localStorage.getItem("arena.theme") || "system"; } catch { return "system"; } });
  const [keys, setKeys] = useState<Record<string, boolean>>({});
  const [keyFor, setKeyFor] = useState<string>("anthropic");
  const [keyVal, setKeyVal] = useState("");
  const [vault, setVault] = useState<{ path: string | null; source: string } | null>(null);
  const [sent, setSent] = useState<{ done: number; total: number } | null>(null);
  const [sentMsg, setSentMsg] = useState<string | null>(null);

  useEffect(() => { void providerKeys().then(setKeys); void vaultInfo().then(setVault); }, []);

  const save = async () => {
    const args = [
      `monthly_cap_usd=${c.monthly_cap_usd}`, `min_games=${c.min_games}`, `replay_sample=${c.replay_sample}`, `sentinel_day=${c.sentinel_day}`,
      `judge=${c.judge}`, `code_tests=${c.code_tests}`, `home_only=${c.home_only.join(",")}`, `home_endpoints=${c.home_endpoints.join(",")}`, `home_hosts=${c.home_hosts.join(",")}`,
    ];
    await arena(["config", "set", ...args]);
    await reload();
    setSaved(true);
    setTimeout(() => setSaved(false), 1600);
  };
  const pickTheme = (t: string) => {
    setTheme(t);
    try { localStorage.setItem("arena.theme", t); } catch { /* storage off */ }
    applyTheme();
  };
  const saveKey = async () => {
    await setProviderKey(keyFor, keyVal.trim());
    setKeyVal("");
    setKeys(await providerKeys());
  };
  const runSentinels = async () => {
    setSentMsg(null);
    setSent({ done: 0, total: 1 });
    try {
      const r = await arenaStream<{ results: unknown[]; regressions: unknown[] }>(["sentinel"], (p) => setSent({ done: p.done, total: p.total }));
      setSentMsg(r.results.length === 0 ? "No routed recipes yet, so there was nothing to check." : `${r.results.length} checks, ${r.regressions.length} regressions.`);
      await reload();
    } catch (e) { setSentMsg((e as Error).message); } finally { setSent(null); }
  };
  const changeVault = async () => {
    const p = await chooseVault();
    if (p) { setVault({ path: p, source: "chosen here" }); await reload(); }
  };

  return (
    <>
      <PageHeader title="Settings" sub="Stored as plain files in your vault (build/_meta/arena/config.json), so Studio and the CLI see the same settings." right={<Button kind="primary" onClick={save} icon={saved ? <Check className="h-4 w-4" /> : undefined}>{saved ? "Saved" : "Save"}</Button>} />

      <div className="card grid grid-cols-3 gap-5 p-5 max-[1100px]:grid-cols-2">
        <Field label="Monthly spend cap" hint="Checked before every cloud call. Local models are free.">
          <div className="flex h-9 items-center rounded-[10px] border border-border bg-surface px-3">
            <span className="text-text-muted">$</span>
            <input type="number" min={0} step={1} value={c.monthly_cap_usd} onChange={(e) => setC({ ...c, monthly_cap_usd: Number(e.target.value) })} className="num w-full bg-transparent pl-1 outline-none" />
          </div>
        </Field>
        <Field label="Games before a route" hint="Decided games a recipe needs in a league before Studio follows it.">
          <input type="number" min={1} max={50} value={c.min_games} onChange={(e) => setC({ ...c, min_games: Number(e.target.value) })} className="num h-9 w-full rounded-[10px] border border-border bg-surface px-3" />
        </Field>
        <Field label="Tasks per replay" hint="The default sample on the Run screen.">
          <input type="number" min={1} max={50} value={c.replay_sample} onChange={(e) => setC({ ...c, replay_sample: Number(e.target.value) })} className="num h-9 w-full rounded-[10px] border border-border bg-surface px-3" />
        </Field>
        <Field label="Judge for known answers" hint="Scores answers to questions where you recorded the decision you made. Home Only questions need a local judge.">
          <Select wide value={c.judge} onChange={(v) => setC({ ...c, judge: v })}>
            <option value="">No judge: use blind picks</option>
            {s.recipes.map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}
          </Select>
        </Field>
        <Field label="Sentinel day" hint="Six fixed tasks run weekly on every routed recipe.">
          <Select wide value={String(c.sentinel_day)} onChange={(v) => setC({ ...c, sentinel_day: Number(v) })}>{DAYS.map((d, i) => <option key={d} value={i}>{d}</option>)}</Select>
        </Field>
        <Field label="Code checks" hint="Run an answer's code against a task's tests, in a temporary folder with no keys, for 10 seconds at most.">
          <Segmented value={c.code_tests ? "on" : "off"} onChange={(v) => setC({ ...c, code_tests: v === "on" })} options={[{ value: "on", label: "On" }, { value: "off", label: "Off" }]} />
        </Field>
      </div>

      <Section title="Home Only league">
        <div className="card grid grid-cols-3 gap-5 p-5 max-[1100px]:grid-cols-2">
          <Field label="Domains" hint="Comma separated. These never reach a cloud model.">
            <input defaultValue={c.home_only.join(", ")} onBlur={(e) => setC({ ...c, home_only: list(e.target.value) })} className="h-9 w-full rounded-[10px] border border-border bg-surface px-3 text-[13.5px]" />
          </Field>
          <Field label="Local endpoints" hint="Ollama or any OpenAI-compatible server.">
            <input defaultValue={c.home_endpoints.join(", ")} onBlur={(e) => setC({ ...c, home_endpoints: list(e.target.value) })} className="num h-9 w-full rounded-[10px] border border-border bg-surface px-3 text-[12.5px]" />
          </Field>
          <Field label="Home hosts" hint="Other machines on your own network that count as home.">
            <input defaultValue={c.home_hosts.join(", ")} onBlur={(e) => setC({ ...c, home_hosts: list(e.target.value) })} placeholder="none" className="num h-9 w-full rounded-[10px] border border-border bg-surface px-3 text-[12.5px]" />
          </Field>
        </div>
      </Section>

      <Section title="Sentinels">
        <div className="card flex items-center justify-between gap-4 p-5">
          <div className="text-[13.5px] text-text-secondary">
            {s.sentinel_due ? <Chip tone="warn">Due</Chip> : <Chip tone="accent">Up to date</Chip>}
            <span className="ml-2">{sentMsg ?? "A pass that turns into a fail is logged as a regression and can suspend a model."}</span>
          </div>
          <Button icon={<Radar className="h-4 w-4" />} onClick={runSentinels} busy={!!sent}>{sent ? `${sent.done} of ${sent.total}` : "Run sentinels now"}</Button>
        </div>
      </Section>

      <Section title="Provider keys">
        <div className="card p-5">
          <p className="mb-3 text-[13px] text-text-secondary">Kept in the macOS Keychain, in the same place Glyph Studio keeps them, so either app can use them. Agent CLIs (claude, codex) sign in on their own and need no key.</p>
          <div className="mb-4 flex flex-wrap gap-1.5">
            {PROVIDERS.map(([id, label]) => <Chip key={id} tone={keys[id] ? "accent" : "muted"} icon={keys[id] ? <Check className="h-3 w-3" /> : undefined}>{label}</Chip>)}
          </div>
          <div className="flex items-center gap-2">
            <Select value={keyFor} onChange={setKeyFor}>{PROVIDERS.map(([id, label]) => <option key={id} value={id}>{label}</option>)}</Select>
            <input type="password" value={keyVal} onChange={(e) => setKeyVal(e.target.value)} placeholder="Paste a key" className="h-9 flex-1 rounded-[10px] border border-border bg-surface px-3 text-[13.5px]" />
            <Button onClick={saveKey} disabled={!keyVal.trim()} icon={<KeyRound className="h-4 w-4" />}>Save key</Button>
          </div>
        </div>
      </Section>

      <Section title="Appearance and vault">
        <div className="card flex flex-wrap items-center justify-between gap-4 p-5">
          <Segmented value={theme} onChange={pickTheme} options={[{ value: "system", label: "System" }, { value: "light", label: "Light" }, { value: "dark", label: "Dark" }]} />
          <div className="flex min-w-0 items-center gap-3">
            <span className="text-text-muted">{theme === "dark" ? <Moon className="h-4 w-4" /> : theme === "light" ? <Sun className="h-4 w-4" /> : <Monitor className="h-4 w-4" />}</span>
            <span className="num selectable truncate text-[12.5px] text-text-secondary" title={vault?.source}>{vault?.path ?? "no vault"}</span>
            <Button size="sm" icon={<FolderOpen className="h-4 w-4" />} onClick={changeVault}>Change</Button>
          </div>
        </div>
        <p className="mt-3 text-[12.5px] text-text-muted">
          Glyph Arena is open source (MIT). <button className="underline decoration-dotted" onClick={() => openExternal("https://glyph.fru.dev/arena")}>glyph.fru.dev/arena</button>
        </p>
      </Section>
    </>
  );
}
