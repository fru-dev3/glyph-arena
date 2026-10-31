import { Ban, Globe, House, Plus, Radar, Telescope } from "lucide-react";
import { useEffect, useState } from "react";
import { arena, type Recipe, type Runtime, type Scouted } from "../api";
import { useArena } from "../App";
import { Button, Chip, Field, PageHeader, RecipeMark, RecipeTags, Section, Segmented, Select } from "../ui";

export function RecipesScreen() {
  const { status, reload } = useArena();
  const s = status!;
  const [runtimes, setRuntimes] = useState<Runtime[] | null>(null);
  const [scouted, setScouted] = useState<Scouted[] | null>(null);
  const [adding, setAdding] = useState(false);
  const [webBusy, setWebBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const routed = new Set((s.policy?.routes ?? []).map((r) => r.recipe));

  const loadScout = () => arena<Scouted[]>(["scout"]).then(setScouted).catch(() => setScouted([]));
  useEffect(() => {
    void arena<Runtime[]>(["recipes", "runtimes"]).then(setRuntimes).catch(() => setRuntimes([]));
    void loadScout();
  }, []);

  const toggle = async (r: Recipe) => {
    await arena(["recipes", "toggle", r.id, r.active === false ? "on" : "off"]);
    await reload();
  };
  const addScouted = async (x: Scouted) => {
    await arena(["scout", "add", "--json", JSON.stringify(x)]);
    await reload();
    await loadScout();
  };
  const scoutWeb = async () => {
    setWebBusy(true);
    setErr(null);
    try { await arena(["scout", "web"]); await loadScout(); } catch (e) { setErr((e as Error).message); } finally { setWebBusy(false); }
  };

  return (
    <>
      <PageHeader
        title="Recipes"
        sub="A recipe is a model plus how it is asked: the prompt style, the vault context it gets, and its tools. Arena tests recipes, not bare models."
        right={<Button kind="primary" icon={<Plus className="h-4 w-4" />} onClick={() => setAdding((v) => !v)}>New recipe</Button>}
      />

      {adding && runtimes && <NewRecipe runtimes={runtimes} onDone={async () => { setAdding(false); await reload(); }} />}

      <div className="grid grid-cols-2 gap-3 max-[1100px]:grid-cols-1">
        {s.recipes.map((r) => (
          <div key={r.id} className={`card flex items-center gap-4 p-4 ${r.active === false ? "opacity-55" : ""}`}>
            <RecipeMark recipe={r} size={44} />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="truncate text-[15px] font-semibold">{r.label}</span>
                {routed.has(r.id) && <Chip tone="accent">Routed</Chip>}
                {r.cli === "ollama" && <Chip tone="home" icon={<House className="h-3 w-3" />}>Local</Chip>}
                {r.blocked && <Chip tone="warn" icon={<Ban className="h-3 w-3" />}>Cannot run</Chip>}
              </div>
              <div className="truncate text-[12.5px] text-text-secondary">{r.cli} · {r.model}</div>
              {r.blocked ? <p className="mt-1 text-[12.5px] text-warn">{r.blocked}</p> : <RecipeTags r={r} />}
            </div>
            <button
              onClick={() => toggle(r)}
              role="switch"
              aria-checked={r.active !== false}
              title={r.active === false ? "Off: not offered for new duels" : "On"}
              className={`relative h-6 w-10 shrink-0 rounded-full transition-colors ${r.active === false ? "bg-surface-strong" : "bg-accent"}`}
            >
              <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${r.active === false ? "left-0.5" : "left-[18px]"}`} />
            </button>
          </div>
        ))}
      </div>

      <Section
        title="Scouted challengers"
        right={<Button size="sm" icon={<Telescope className="h-4 w-4" />} onClick={scoutWeb} busy={webBusy} title="Ask the web scout for new models (uses the claude CLI)">Scout the web</Button>}
      >
        {err && <div className="mb-3 text-[13px] text-err">{err}</div>}
        {!scouted ? (
          <div className="card px-5 py-6 text-text-muted">Looking...</div>
        ) : scouted.length === 0 ? (
          <div className="card flex items-center gap-3 px-5 py-6 text-[14px] text-text-muted"><Radar className="h-5 w-5" />Nothing new: every local model is already a recipe, and the overnight scout has not found anything yet.</div>
        ) : (
          <div className="card divide-y divide-border-subtle">
            {scouted.map((x) => (
              <div key={`${x.cli}|${x.model}|${x.base_url ?? ""}`} className="flex items-center gap-3 px-4 py-3">
                <div className={`grid h-9 w-9 shrink-0 place-items-center rounded-[10px] ${x.source === "local" ? "bg-home-soft text-home" : "bg-ai-soft text-ai"}`}>
                  {x.source === "local" ? <House className="h-4 w-4" /> : <Globe className="h-4 w-4" />}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-[14px] font-medium">{x.label}</div>
                  <div className="truncate text-[12.5px] text-text-muted">{x.why}</div>
                </div>
                {x.cli ? <Button size="sm" onClick={() => addScouted(x)} icon={<Plus className="h-3.5 w-3.5" />}>Add</Button> : <Chip>Needs a runtime</Chip>}
              </div>
            ))}
          </div>
        )}
      </Section>
    </>
  );
}

function NewRecipe({ runtimes, onDone }: { runtimes: Runtime[]; onDone: () => void }) {
  const [rt, setRt] = useState(0);
  const runtime = runtimes[rt];
  const [model, setModel] = useState(runtime?.models[0] ?? "");
  const [prompt, setPrompt] = useState<Recipe["prompt"]>("plain");
  const [context, setContext] = useState<Recipe["context"]>("none");
  const [tools, setTools] = useState<Recipe["tools"]>("none");
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => { setModel(runtimes[rt]?.models[0] ?? ""); }, [rt, runtimes]);

  if (!runtime) return <div className="card mb-4 p-5 text-[14px] text-text-muted">No runtimes found on this Mac: install the claude or codex CLI, start Ollama, or add a provider key in Settings.</div>;
  const save = async () => {
    setErr(null);
    try {
      await arena(["recipes", "add", "--cli", runtime.cli, "--model", model, ...(runtime.baseUrl ? ["--base-url", runtime.baseUrl] : []), "--prompt", prompt, "--context", context, "--tools", tools]);
      onDone();
    } catch (e) { setErr((e as Error).message); }
  };
  return (
    <div className="card rise mb-4 p-5">
      <div className="grid grid-cols-2 gap-4 max-[1100px]:grid-cols-1">
        <Field label="Runtime">
          <Select wide value={String(rt)} onChange={(v) => setRt(Number(v))}>
            {runtimes.map((r, i) => <option key={`${r.cli}${r.baseUrl ?? ""}`} value={i}>{r.label}{r.local ? " (local)" : ""}</option>)}
          </Select>
        </Field>
        <Field label="Model">
          <input list="arena-models" value={model} onChange={(e) => setModel(e.target.value)} className="h-9 w-full rounded-[10px] border border-border bg-surface px-3 text-[13.5px]" />
          <datalist id="arena-models">{runtime.models.map((m) => <option key={m} value={m} />)}</datalist>
        </Field>
        <Field label="Prompt style"><Segmented value={prompt} onChange={setPrompt} options={[{ value: "plain", label: "Plain" }, { value: "concise", label: "Concise" }, { value: "expert", label: "Expert" }]} /></Field>
        <Field label="Vault context" hint="The domain's ideal and current state, capped at 4,000 characters. Never sent to a cloud model for a Home Only domain.">
          <Segmented value={context} onChange={setContext} options={[{ value: "none", label: "None" }, { value: "domain", label: "Domain notes" }]} />
        </Field>
        <Field label="Tools" hint="Web search, where the runtime supports it. Off by default so duels stay fair.">
          <Segmented value={tools} onChange={setTools} options={[{ value: "none", label: "None" }, { value: "web", label: "Web" }]} />
        </Field>
      </div>
      {err && <div className="mt-3 text-[13px] text-err">{err}</div>}
      <div className="mt-5 flex justify-end gap-2">
        <Button kind="primary" onClick={save} disabled={!model}>Add recipe</Button>
      </div>
    </div>
  );
}
