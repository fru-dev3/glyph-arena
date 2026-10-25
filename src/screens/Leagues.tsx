import { House, Trophy } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { arena, type Standing, type TaskKind, type Weight } from "../api";
import { useArena } from "../App";
import { Bar, Button, Chip, domainLabel, Empty, KIND_LABEL, money, PageHeader, RecipeMark, secs, Segmented } from "../ui";

const KINDS: TaskKind[] = ["drafting", "decision", "research", "planning", "video_script", "coding", "general"];

export function LeaguesScreen() {
  const { status, go } = useArena();
  const s = status!;
  const recipes = new Map(s.recipes.map((r) => [r.id, r]));
  const domains = useMemo(() => [...new Set(s.leagues.map((l) => l.league.domain))].sort((a, b) => (a === "*" ? 1 : b === "*" ? -1 : a.localeCompare(b))), [s.leagues]);
  const kinds = KINDS.filter((k) => s.leagues.some((l) => l.league.kind === k));
  const cell = (d: string, k: string) => {
    const rows = s.leagues.filter((l) => l.league.domain === d && l.league.kind === k);
    return { duels: rows.reduce((a, r) => a + r.duels, 0), decided: rows.reduce((a, r) => a + r.decided, 0) };
  };
  const max = Math.max(1, ...domains.flatMap((d) => kinds.map((k) => cell(d, k).decided)));
  const first = s.leagues[0]?.league;
  const [sel, setSel] = useState<{ domain: string; kind: string } | null>(first ? { domain: first.domain, kind: first.kind } : null);
  const [weight, setWeight] = useState<Weight | "*">("*");
  const [table, setTable] = useState<Standing[] | null>(null);

  useEffect(() => {
    if (!sel) return;
    setTable(null);
    void arena<{ standings: Standing[] }>(["league", "--domain", sel.domain, "--kind", sel.kind, "--weight", weight]).then((r) => setTable(r.standings));
  }, [sel, weight]);

  const routeFor = (d: string, k: string) =>
    s.policy?.routes.find((r) => r.domain === d && r.kind === k && r.weight === "*") ?? s.policy?.routes.find((r) => r.domain === d && r.kind === k);

  if (s.leagues.length === 0) {
    return (
      <>
        <PageHeader title="Leagues" sub="Every domain and kind of task is its own league, split into weight classes by difficulty." />
        <Empty icon={<Trophy className="h-7 w-7" />} title="No games played" body="Leagues fill in as duels are decided by checkers, agreement and your blind picks." action={<Button kind="primary" onClick={() => go("run")}>Run a replay</Button>} />
      </>
    );
  }

  return (
    <>
      <PageHeader title="Leagues" sub="Every domain and kind of task is its own league, with light, middle and heavy weight classes. Darker cells have more decided games." />
      <div className="card scroll overflow-x-auto p-4">
        <table className="w-full border-separate border-spacing-1.5">
          <thead>
            <tr>
              <th className="w-[140px]" />
              {kinds.map((k) => <th key={k} className="px-1 pb-1 text-left text-[12px] font-medium text-text-muted">{KIND_LABEL[k]}</th>)}
            </tr>
          </thead>
          <tbody>
            {domains.map((d) => (
              <tr key={d}>
                <td className="pr-2 text-[13.5px] font-medium">
                  <span className="inline-flex items-center gap-1.5">{domainLabel(d)}{s.config.home_only.includes(d) && <House className="h-3.5 w-3.5 text-home" />}</span>
                </td>
                {kinds.map((k) => {
                  const c = cell(d, k);
                  const on = sel?.domain === d && sel?.kind === k;
                  const route = routeFor(d, k);
                  const heat = c.decided / max;
                  if (!c.duels) return <td key={k}><div className="h-[54px] rounded-xl border border-dashed border-border-subtle" /></td>;
                  return (
                    <td key={k}>
                      <button
                        onClick={() => setSel({ domain: d, kind: k })}
                        className={`flex h-[54px] w-full items-center gap-2 rounded-xl border px-2.5 text-left transition-all ${on ? "border-accent ring-2 ring-accent/25" : "border-transparent hover:border-border"}`}
                        style={{ background: `color-mix(in srgb, var(--color-accent) ${Math.round(6 + heat * 26)}%, var(--color-surface))` }}
                      >
                        {route ? <RecipeMark recipe={recipes.get(route.recipe) ?? { cli: route.cli, label: route.model }} size={26} /> : <div className="h-[26px] w-[26px] rounded-[8px] border border-dashed border-text-muted/40" />}
                        <div className="min-w-0 leading-tight">
                          <div className="num text-[13px] font-semibold">{c.decided}</div>
                          <div className="text-[11px] text-text-secondary">{c.duels - c.decided ? `${c.duels - c.decided} open` : "decided"}</div>
                        </div>
                      </button>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {sel && (
        <div className="card mt-5 overflow-hidden">
          <div className="flex items-center justify-between border-b border-border-subtle px-5 py-4">
            <div>
              <div className="display text-[22px] font-semibold">{domainLabel(sel.domain)} · {KIND_LABEL[sel.kind]}</div>
              <div className="text-[12.5px] text-text-muted">Ranked by the lower bound of the win rate, so a lucky streak does not lead. Ties count half.</div>
            </div>
            <Segmented value={weight} onChange={setWeight} options={[{ value: "*", label: "All" }, { value: "light", label: "Light" }, { value: "middle", label: "Middle" }, { value: "heavy", label: "Heavy" }]} />
          </div>
          {!table ? (
            <div className="px-5 py-8 text-text-muted">Loading...</div>
          ) : table.length === 0 ? (
            <div className="px-5 py-8 text-[14px] text-text-muted">No decided games in this weight class yet.</div>
          ) : (
            <table className="w-full text-[13.5px]">
              <thead className="text-left text-[12px] text-text-muted">
                <tr className="border-b border-border-subtle">
                  <th className="w-12 py-2.5 pl-5 font-medium">#</th>
                  <th className="font-medium">Recipe</th>
                  <th className="font-medium">Record</th>
                  <th className="w-[200px] font-medium">Share of points</th>
                  <th className="font-medium">Per answer</th>
                  <th className="pr-5 font-medium">Time</th>
                </tr>
              </thead>
              <tbody>
                {table.map((t, i) => {
                  const r = recipes.get(t.recipe);
                  return (
                    <tr key={t.recipe} className="border-b border-border-subtle last:border-0">
                      <td className="num py-3 pl-5 text-text-muted">{i + 1}</td>
                      <td>
                        <div className="flex items-center gap-2.5">
                          <RecipeMark recipe={r ?? { cli: "", label: t.recipe }} size={28} />
                          <div>
                            <div className="font-medium">{r?.label ?? t.recipe}</div>
                            <div className="text-[12px] text-text-muted">{r?.cli} {r?.model}</div>
                          </div>
                          {i === 0 && t.games >= s.config.min_games && <Chip tone="accent">Leader</Chip>}
                        </div>
                      </td>
                      <td className="num">{t.wins}-{t.losses}-{t.ties}</td>
                      <td>
                        <div className="flex items-center gap-2 pr-4">
                          <Bar value={t.rate} tone={r?.cli === "ollama" ? "home" : "accent"} />
                          <span className="num w-10 text-right text-[12px] text-text-secondary">{Math.round(t.rate * 100)}%</span>
                        </div>
                      </td>
                      <td className="num text-text-secondary">{money(t.cost_avg)}</td>
                      <td className="num pr-5 text-text-secondary">{t.ms_avg ? secs(t.ms_avg) : "--"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      )}
    </>
  );
}
