import { ArrowRight, Ban, FileJson, FlaskConical, RefreshCw, Swords, Trophy } from "lucide-react";
import { useState } from "react";
import { arena, type Policy, type Recipe, type Route } from "../api";
import { useArena } from "../App";
import { ago, Bar, Button, Chip, domainLabel, Empty, KIND_LABEL, money, PageHeader, RecipeMark, RecipeTags, Ring, Section, VERDICT, WEIGHT_LABEL } from "../ui";

export function PolicyScreen() {
  const { status, reload, go } = useArena();
  const [busy, setBusy] = useState(false);
  const policy = status!.policy;
  const recipes = new Map(status!.recipes.map((r) => [r.id, r]));
  const routes = policy?.routes ?? [];
  const ub = policy?.unblinding;
  const spent = status!.budget.spent_usd;
  const cap = status!.budget.cap_usd;

  const shown = [...new Set(routes.map((r) => r.domain))].reduce((a, d) => a + collapse(routes.filter((r) => r.domain === d)).length, 0);
  const rebuild = async () => {
    setBusy(true);
    try { await arena<Policy>(["policy", "rebuild"]); await reload(); } finally { setBusy(false); }
  };

  const byDomain = new Map<string, Route[]>();
  for (const r of [...routes].sort((a, b) => (a.domain === "*" ? 1 : 0) - (b.domain === "*" ? 1 : 0))) {
    if (!byDomain.has(r.domain)) byDomain.set(r.domain, []);
    byDomain.get(r.domain)!.push(r);
  }

  return (
    <>
      <PageHeader
        title="Routing policy"
        sub="What Glyph Studio follows on Auto, per domain and kind of task."
        right={<Button icon={<RefreshCw className="h-4 w-4" />} onClick={rebuild} busy={busy}>Rebuild</Button>}
      />

      <div className="grid grid-cols-4 gap-3 max-[1100px]:grid-cols-2">
        <Stat visual={<div className="grid h-12 w-12 place-items-center rounded-2xl bg-surface-warm text-text-secondary"><Trophy className="h-5 w-5" /></div>}
          value={String(shown)} label="Routes" title={policy ? `Updated ${ago(policy.generated_at)}` : "No policy yet"} />
        <Stat visual={<Ring value={ub?.score ?? 0} size={48} stroke={5} tone="accent"><span className="num text-[11px] font-semibold">{ub?.score == null ? "--" : `${Math.round(ub.score * 100)}`}</span></Ring>}
          value={ub?.score == null ? "--" : `${Math.round(ub.score * 100)}%`} label="Unblinding" title={ub?.picks ? `Your blind pick matched the route in ${ub.agree} of ${ub.picks}` : "After your first blind picks"} />
        <Stat onClick={() => go("picks")} visual={<div className="grid h-12 w-12 place-items-center rounded-2xl bg-accent-soft text-accent"><Swords className="h-5 w-5" /></div>}
          value={String(status!.counts.pending)} label="Picks waiting" title="Two seconds each" />
        <Stat visual={<Ring value={cap ? spent / cap : 0} size={48} stroke={5} tone={cap && spent / cap > 0.9 ? "err" : "accent"}><span className="num text-[11px] font-semibold">{cap ? Math.round((spent / cap) * 100) : "--"}</span></Ring>}
          value={money(spent)} label={`of $${cap.toFixed(0)}`} title={`Spent this month against the cap, ${status!.budget.month}`} />
      </div>

      {routes.length === 0 ? (
        <div className="mt-8">
          <Empty
            icon={<FlaskConical className="h-7 w-7" />}
            title="No routes yet"
            body="Run a few duels on your own past tasks, then make some blind picks. A recipe needs three decided games in a league before Studio follows it."
            action={<Button kind="primary" size="lg" onClick={() => go("run")} icon={<FlaskConical className="h-4 w-4" />}>Run your first duel</Button>}
          />
        </div>
      ) : (
        [...byDomain.entries()].map(([domain, list]) => (
          <Section key={domain} title={domain === "*" ? "Any other domain" : domainLabel(domain)} right={domain !== "*" && status!.config.home_only.includes(domain) ? <Chip tone="home">Home Only</Chip> : domain === "*" ? <span className="text-[12.5px] text-text-muted">Fallbacks for domains with no games of their own</span> : undefined}>
            <div className="card divide-y divide-border-subtle overflow-hidden">
              {collapse(list).map((r) => <RouteRow key={`${r.domain}|${r.kind}|${r.weight}`} r={r} recipe={recipes.get(r.recipe)} />)}
            </div>
          </Section>
        ))
      )}

      {(policy?.suspended.length ?? 0) > 0 && (
        <Section title="Suspended">
          <div className="card divide-y divide-border-subtle">
            {policy!.suspended.map((s) => (
              <div key={`${s.model}|${s.domain}`} className="flex items-start gap-3 p-4">
                <div className="grid h-8 w-8 shrink-0 place-items-center rounded-[9px] bg-err-soft text-err"><Ban className="h-4 w-4" /></div>
                <div className="min-w-0 flex-1">
                  <div className="text-[14px] font-medium">{s.model} <span className="font-normal text-text-muted">in {s.domain === "*" ? "every domain" : domainLabel(s.domain)} until {s.until}</span></div>
                  <div className="text-[13px] text-text-secondary">{s.why}</div>
                </div>
              </div>
            ))}
          </div>
        </Section>
      )}

      <div className="mt-8 flex items-center gap-2 text-[12.5px] text-text-muted">
        <FileJson className="h-4 w-4" />
        <span>Studio reads</span>
        <span className="num selectable truncate text-text-secondary">{status!.studio_policy_path}</span>
      </div>
    </>
  );
}

/**
 * One row per kind of task: the all-weights route, plus a weight class only where it
 * routes somewhere else. The domain-wide catch-all shows last, and only when it adds
 * a recipe the kinds above do not already name. policy.json keeps every route.
 */
function collapse(list: Route[]): Route[] {
  const out: Route[] = [];
  const kinds = [...new Set(list.filter((r) => r.kind !== "*").map((r) => r.kind))];
  for (const k of kinds) {
    const rows = list.filter((r) => r.kind === k);
    const all = rows.find((r) => r.weight === "*");
    if (all) out.push(all);
    for (const r of rows) if (r.weight !== "*" && (!all || r.recipe !== all.recipe)) out.push(r);
  }
  const wide = list.find((r) => r.kind === "*");
  if (wide && !out.some((r) => r.recipe === wide.recipe)) out.push(wide);
  return out;
}

/** A number and what it is. What it means is on the hover, not under it. */
function Stat({ visual, value, label, title, onClick }: { visual: React.ReactNode; value: string; label: string; title?: string; onClick?: () => void }) {
  const Tag = onClick ? "button" : "div";
  return (
    <Tag onClick={onClick} title={title} className={`card flex items-center gap-3.5 p-4 text-left ${onClick ? "transition-transform hover:-translate-y-px" : ""}`}>
      <div className="shrink-0">{visual}</div>
      <div className="min-w-0 leading-tight">
        <div className="num text-[21px] font-semibold">{value}</div>
        <div className="mt-0.5 truncate text-[13px] font-medium text-text-secondary">{label}</div>
      </div>
    </Tag>
  );
}

function RouteRow({ r, recipe }: { r: Route; recipe?: Recipe }) {
  const v = VERDICT[r.verdict];
  const [open, setOpen] = useState(false);
  return (
    <button
      type="button"
      onClick={() => setOpen((o) => !o)}
      aria-expanded={open}
      title={open ? "Hide why" : "Why this route"}
      className="grid w-full grid-cols-[minmax(180px,1fr)_28px_minmax(220px,1.3fr)_170px] items-center gap-x-4 gap-y-2 px-5 py-4 text-left transition-colors hover:bg-surface-warm/60 max-[1100px]:grid-cols-[1fr_24px_1fr]">
      <div className="min-w-0">
        <div className="text-[14.5px] font-semibold">{r.kind === "*" ? "Anything else" : KIND_LABEL[r.kind]}</div>
        <div className="text-[12.5px] text-text-muted">{r.weight === "*" ? "All weights" : `${WEIGHT_LABEL[r.weight]} tasks`} · {r.games} games</div>
      </div>
      <ArrowRight className="h-4 w-4 text-text-muted" />
      <div className="flex min-w-0 items-center gap-3">
        <RecipeMark recipe={recipe ?? { cli: r.cli, label: r.model }} size={34} />
        <div className="min-w-0">
          <div className="truncate text-[14.5px] font-medium">{recipe?.label ?? r.model}</div>
          <RecipeTags r={{ prompt: r.prompt as Recipe["prompt"], context: r.context as Recipe["context"], tools: r.tools as Recipe["tools"] }} />
        </div>
      </div>
      <div className="flex flex-col items-end gap-1.5 max-[1100px]:col-span-3 max-[1100px]:flex-row max-[1100px]:items-center max-[1100px]:justify-between">
        <Chip tone={v.tone}>{v.label}</Chip>
        <div className="flex w-[150px] items-center gap-2" title={`${Math.round(r.confidence * 100)}% confidence over ${r.games} games`}>
          <Bar value={r.confidence} tone={v.tone === "home" ? "home" : v.tone === "ai" ? "ai" : "accent"} />
          <span className="num w-9 text-right text-[11.5px] text-text-muted">{Math.round(r.confidence * 100)}%</span>
        </div>
      </div>
      {open && (
        <p className="selectable col-span-4 text-[13.5px] leading-relaxed text-text-secondary max-[1100px]:col-span-3">
          {r.why}
        </p>
      )}
    </button>
  );
}
