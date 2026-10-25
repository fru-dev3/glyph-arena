import { AlertTriangle, CheckCircle2, CircleDashed, FlaskConical, House, Play, Swords, XCircle } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { arena, arenaStream, type DuelBrief, type Progress, type Recipe } from "../api";
import { useArena } from "../App";
import { ago, Bar, Button, Chip, domainLabel, Field, KIND_LABEL, leagueText, PageHeader, RecipeMark, Section, Segmented, Select } from "../ui";

type Source = "ghost" | "canonical" | "sentinel" | "custom";
const SOURCE_HELP: Record<Source, string> = {
  ghost: "Your own past prompts, replayed. Ones that only made sense in their old conversation are left out.",
  canonical: "Your benchmark questions with the decision you actually made: judged against it.",
  sentinel: "Six fixed tasks with checkers. Arena runs them weekly to catch silent regressions.",
  custom: "Tasks you wrote in tasks.json, each with an optional checker.",
};

export function RunScreen() {
  const { status, reload, go } = useArena();
  const s = status!;
  const active = s.recipes.filter((r) => r.active !== false);
  const [source, setSource] = useState<Source>("ghost");
  const [domain, setDomain] = useState("*");
  const [kind, setKind] = useState("*");
  const [weight, setWeight] = useState("*");
  const [a, setA] = useState(active[0]?.id ?? "");
  const [b, setB] = useState(active[1]?.id ?? "");
  const [n, setN] = useState(s.config.replay_sample);
  const [matches, setMatches] = useState<{ prompt: string; home_only: boolean }[] | null>(null);
  const [running, setRunning] = useState(false);
  const [prog, setProg] = useState<{ done: number; total: number; notes: string[]; duels: DuelBrief[] } | null>(null);
  const [recent, setRecent] = useState<DuelBrief[]>([]);
  const [err, setErr] = useState<string | null>(null);

  const recipes = useMemo(() => new Map(s.recipes.map((r) => [r.id, r])), [s.recipes]);
  const ra = recipes.get(a);
  const rb = recipes.get(b);
  const domains = useMemo(() => [...new Set([...s.domains, ...s.leagues.map((l) => l.league.domain)])].filter((d) => d !== "*").sort(), [s]);
  const leagueArgs = ["--domain", domain, "--kind", kind, "--weight", weight];

  useEffect(() => {
    setMatches(null);
    void arena<{ prompt: string; home_only: boolean }[]>(["tasks", "--source", source, ...leagueArgs, "--limit", String(n)]).then(setMatches).catch(() => setMatches([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [source, domain, kind, weight, n]);
  const loadRecent = () => arena<DuelBrief[]>(["duels", "--limit", "12"]).then(setRecent);
  useEffect(() => { void loadRecent(); }, []);

  const localOnly = (r?: Recipe) => !!r && r.cli === "ollama";
  const homeTasks = matches?.filter((m) => m.home_only).length ?? 0;
  const homeBlocked = homeTasks > 0 && !(localOnly(ra) && localOnly(rb));

  const run = async () => {
    setErr(null);
    setRunning(true);
    setProg({ done: 0, total: matches?.length ?? n, notes: [], duels: [] });
    try {
      await arenaStream(["replay", "--a", a, "--b", b, "--source", source, ...leagueArgs, "--n", String(n)], (p: Progress) => {
        setProg((cur) => cur && {
          done: p.done,
          total: p.total,
          notes: p.note ? [...cur.notes, p.note] : cur.notes,
          duels: p.duel ? [...cur.duels, p.duel] : cur.duels,
        });
      });
      await reload();
      await loadRecent();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setRunning(false);
    }
  };

  return (
    <>
      <PageHeader title="Run" sub="Replay your own tasks on two recipes. Checkers and agreement settle what they can; the rest becomes a blind pick." />

      <div className="card p-5">
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <Segmented<Source> value={source} onChange={setSource} options={[{ value: "ghost", label: "Ghost replays" }, { value: "canonical", label: "Known answers" }, { value: "sentinel", label: "Sentinels" }, { value: "custom", label: "Custom" }]} />
          <p className="max-w-[52ch] text-[12.5px] text-text-muted">{SOURCE_HELP[source]}</p>
        </div>

        <div className="grid grid-cols-4 gap-3 max-[1100px]:grid-cols-2">
          <Field label="Domain">
            <Select wide value={domain} onChange={setDomain}>
              <option value="*">Any domain</option>
              {domains.map((d) => <option key={d} value={d}>{domainLabel(d)}{s.config.home_only.includes(d) ? " (Home Only)" : ""}</option>)}
            </Select>
          </Field>
          <Field label="Kind of task">
            <Select wide value={kind} onChange={setKind}>
              <option value="*">Any task</option>
              {Object.entries(KIND_LABEL).filter(([k]) => k !== "*").map(([k, l]) => <option key={k} value={k}>{l}</option>)}
            </Select>
          </Field>
          <Field label="Weight class">
            <Select wide value={weight} onChange={setWeight}>
              <option value="*">Any weight</option>
              <option value="light">Light</option>
              <option value="middle">Middle</option>
              <option value="heavy">Heavy</option>
            </Select>
          </Field>
          <Field label="Tasks">
            <div className="flex h-9 items-center gap-2">
              <input type="range" min={1} max={20} value={n} onChange={(e) => setN(Number(e.target.value))} className="flex-1 accent-[var(--color-accent)]" />
              <span className="num w-6 text-right text-[13px]">{n}</span>
            </div>
          </Field>
        </div>

        <div className="mt-5 grid grid-cols-[1fr_56px_1fr] items-center gap-3">
          <RecipePick value={a} onChange={setA} recipes={active} />
          <div className="mx-auto grid h-12 w-12 place-items-center rounded-full border border-border bg-surface-warm text-text-secondary"><Swords className="h-5 w-5" /></div>
          <RecipePick value={b} onChange={setB} recipes={active} />
        </div>

        <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-border-subtle pt-4">
          <div className="flex min-w-0 items-center gap-2 text-[13px] text-text-secondary">
            {matches === null ? "Finding tasks..." : (
              <>
                <span className="num font-semibold text-text-primary">{matches.length}</span> {matches.length === 1 ? "task matches" : "tasks match"}
                {homeTasks > 0 && <Chip tone="home" icon={<House className="h-3.5 w-3.5" />}>{homeTasks} Home Only</Chip>}
              </>
            )}
            {homeBlocked && <span className="flex items-center gap-1.5 text-warn"><AlertTriangle className="h-4 w-4" />Home Only tasks are skipped unless both recipes are local.</span>}
          </div>
          <Button kind="primary" size="lg" icon={<Play className="h-4 w-4" />} onClick={run} busy={running} disabled={!a || !b || a === b || !matches?.length}>
            Run {matches?.length ?? ""} duels
          </Button>
        </div>
        {matches && matches.length > 0 && !prog && (
          <ul className="mt-4 space-y-1.5">
            {matches.slice(0, 3).map((m, i) => (
              <li key={i} className="truncate text-[13px] text-text-muted">
                <span className="text-text-secondary">{i + 1}.</span> {m.prompt}
              </li>
            ))}
          </ul>
        )}
      </div>

      {err && <div className="mt-4 rounded-xl border border-err/30 bg-err-soft px-4 py-3 text-[13.5px] text-err">{err}</div>}

      {prog && (
        <Section title={running ? "Running" : "Finished"} right={!running && prog.duels.some((d) => d.outcome === "pending") ? <Button kind="primary" size="sm" onClick={() => go("picks")}>Pick the open ones</Button> : undefined}>
          <div className="card p-5">
            <div className="mb-4 flex items-center gap-3">
              <Bar value={prog.total ? prog.done / prog.total : 0} />
              <span className="num shrink-0 text-[12.5px] text-text-muted">{prog.done} of {prog.total}</span>
            </div>
            <div className="space-y-2">
              {prog.duels.map((d) => <DuelLine key={d.id} d={d} recipes={recipes} />)}
              {prog.notes.map((t, i) => <div key={i} className="text-[12.5px] text-text-muted">{t}</div>)}
            </div>
          </div>
        </Section>
      )}

      <Section title="Recent duels">
        {recent.length === 0 ? (
          <div className="card px-5 py-8 text-center text-[14px] text-text-muted"><FlaskConical className="mx-auto mb-2 h-5 w-5" />No duels yet.</div>
        ) : (
          <div className="card divide-y divide-border-subtle">
            {recent.map((d) => <div key={d.id} className="px-4 py-3"><DuelLine d={d} recipes={recipes} withTime /></div>)}
          </div>
        )}
      </Section>
    </>
  );
}

function RecipePick({ value, onChange, recipes }: { value: string; onChange: (v: string) => void; recipes: Recipe[] }) {
  const r = recipes.find((x) => x.id === value);
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-border-subtle bg-surface-warm p-3">
      <RecipeMark recipe={r} size={40} />
      <div className="min-w-0 flex-1">
        <Select wide value={value} onChange={onChange}>
          {recipes.map((x) => <option key={x.id} value={x.id}>{x.label}{x.cli === "ollama" ? " (local)" : ""}</option>)}
        </Select>
        <div className="mt-1 truncate pl-1 text-[12px] text-text-muted">{r ? `${r.cli} · ${r.model}` : "choose a recipe"}</div>
      </div>
    </div>
  );
}

export function DuelLine({ d, recipes, withTime }: { d: DuelBrief; recipes: Map<string, Recipe>; withTime?: boolean }) {
  const A = recipes.get(d.a.recipe);
  const B = recipes.get(d.b.recipe);
  const winner = d.outcome === "a" ? A : d.outcome === "b" ? B : null;
  const by = { check: "by checker", agree: "they agreed", judge: "by judge", pick: "your pick", signal: "from use", none: "" }[d.decided_by] ?? "";
  let chip;
  if (d.outcome === "pending") chip = <Chip tone="accent" icon={<CircleDashed className="h-3.5 w-3.5" />}>Waiting for your pick</Chip>;
  else if (d.outcome === "error") chip = <Chip tone="err" icon={<XCircle className="h-3.5 w-3.5" />} title={d.a.error || d.b.error}>{d.a.status === "privacy" || d.b.status === "privacy" ? "Refused: Home Only" : d.a.status === "budget" || d.b.status === "budget" ? "Skipped: budget" : "Not scored"}</Chip>;
  else if (d.outcome === "tie") chip = <Chip tone="ai">Even, {by}</Chip>;
  else chip = <Chip tone="accent" icon={<CheckCircle2 className="h-3.5 w-3.5" />}>{winner?.label ?? "?"} wins, {by}</Chip>;
  return (
    <div className="flex items-center gap-3">
      <div className="flex -space-x-1.5">
        <RecipeMark recipe={A ?? { cli: "", label: d.a.recipe }} size={24} />
        <RecipeMark recipe={B ?? { cli: "", label: d.b.recipe }} size={24} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="truncate text-[13.5px]">{d.task.prompt}</div>
        <div className="text-[12px] text-text-muted">{leagueText(d.league)}{withTime ? ` · ${ago(d.ts)}` : ""}</div>
      </div>
      {chip}
    </div>
  );
}
