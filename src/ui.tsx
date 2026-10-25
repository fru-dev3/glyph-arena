import { House, Loader2 } from "lucide-react";
import type { ReactNode } from "react";
import type { League, Recipe, Route } from "./api";

export const KIND_LABEL: Record<string, string> = {
  drafting: "Drafting", decision: "Decisions", research: "Research", planning: "Planning",
  video_script: "Video scripts", coding: "Coding", general: "General", "*": "Any task",
};
export const WEIGHT_LABEL: Record<string, string> = { light: "Light", middle: "Middle", heavy: "Heavy", "*": "Any weight" };
export const VERDICT: Record<Route["verdict"], { label: string; tone: Tone }> = {
  best: { label: "Best", tone: "accent" },
  equivalent_cheaper: { label: "Equivalent, cheaper", tone: "ai" },
  home_only: { label: "Home Only", tone: "home" },
  provisional: { label: "Provisional", tone: "muted" },
};

export const domainLabel = (d: string) => (d === "*" ? "Any domain" : d.replace(/-/g, " ").replace(/^./, (c) => c.toUpperCase()));
export const leagueText = (l: League) => [domainLabel(l.domain), KIND_LABEL[l.kind], WEIGHT_LABEL[l.weight]].join(" · ");

export function money(x: number): string {
  if (!x) return "free";
  if (x < 0.01) return `$${x.toFixed(4)}`;
  if (x < 1) return `$${x.toFixed(3)}`;
  return `$${x.toFixed(2)}`;
}
export const secs = (ms: number) => (ms < 1000 ? `${ms} ms` : `${(ms / 1000).toFixed(ms < 10_000 ? 1 : 0)} s`);
export function ago(iso: string | number): string {
  const t = typeof iso === "number" ? iso : Date.parse(iso);
  const s = Math.max(0, (Date.now() - t) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86400) return `${Math.round(s / 3600)} h ago`;
  return `${Math.round(s / 86400)} d ago`;
}

type Tone = "accent" | "ai" | "home" | "muted" | "warn" | "err";
const TONE: Record<Tone, string> = {
  accent: "bg-accent-soft text-accent border-accent-border",
  ai: "bg-ai-soft text-ai border-[color:var(--color-ai-soft)]",
  home: "bg-home-soft text-home border-[color:var(--color-home-soft)]",
  muted: "bg-surface-warm text-text-muted border-border-subtle",
  warn: "bg-warn-soft text-warn border-[color:var(--color-warn-soft)]",
  err: "bg-err-soft text-err border-[color:var(--color-err-soft)]",
};

export function Chip({ tone = "muted", icon, children, title }: { tone?: Tone; icon?: ReactNode; children: ReactNode; title?: string }) {
  return (
    <span title={title} className={`inline-flex h-6 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 text-[12px] font-medium ${TONE[tone]}`}>
      {icon}
      {children}
    </span>
  );
}

export function Button({ children, onClick, kind = "plain", disabled, icon, title, busy, size = "md" }: {
  children?: ReactNode; onClick?: () => void; kind?: "primary" | "plain" | "ghost" | "danger"; disabled?: boolean; icon?: ReactNode; title?: string; busy?: boolean; size?: "sm" | "md" | "lg";
}) {
  const k = {
    primary: "bg-accent text-on-accent hover:bg-accent-hover shadow-[0_1px_0_rgba(255,255,255,.18)_inset,0_6px_16px_-8px_rgba(0,128,0,.6)]",
    plain: "bg-surface border border-border text-text-primary hover:bg-surface-warm",
    ghost: "text-text-secondary hover:bg-surface-warm hover:text-text-primary",
    danger: "bg-surface border border-border text-err hover:bg-err-soft",
  }[kind];
  const s = { sm: "h-8 px-3 text-[13px] rounded-lg", md: "h-9 px-3.5 text-[13.5px] rounded-[10px]", lg: "h-11 px-5 text-[15px] rounded-xl" }[size];
  return (
    <button title={title} onClick={onClick} disabled={disabled || busy} className={`inline-flex items-center justify-center gap-2 font-medium transition-colors disabled:opacity-45 ${k} ${s}`}>
      {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : icon}
      {children}
    </button>
  );
}

export function Segmented<T extends string>({ value, options, onChange }: { value: T; options: { value: T; label: string }[]; onChange: (v: T) => void }) {
  return (
    <div className="inline-flex rounded-[10px] border border-border-subtle bg-surface-warm p-0.5">
      {options.map((o) => (
        <button
          key={o.value}
          onClick={() => onChange(o.value)}
          className={`h-8 rounded-lg px-3 text-[13px] font-medium transition-all ${value === o.value ? "bg-surface text-text-primary shadow-[0_1px_2px_rgba(0,0,0,.08)]" : "text-text-muted hover:text-text-primary"}`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Select({ value, onChange, children, wide }: { value: string; onChange: (v: string) => void; children: ReactNode; wide?: boolean }) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={`h-9 appearance-none rounded-[10px] border border-border bg-surface bg-[length:12px] bg-[right_10px_center] bg-no-repeat pr-8 pl-3 text-[13.5px] ${wide ? "w-full" : ""}`}
      style={{ backgroundImage: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%237a725f' stroke-width='2.5'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E\")" }}
    >
      {children}
    </select>
  );
}

/** A ring meter (budget, scores). value 0..1. */
export function Ring({ value, size = 64, stroke = 7, tone = "accent", children }: { value: number; size?: number; stroke?: number; tone?: "accent" | "warn" | "err" | "ai"; children?: ReactNode }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const v = Math.max(0, Math.min(1, value));
  const color = { accent: "var(--color-accent)", warn: "var(--color-warn)", err: "var(--color-err)", ai: "var(--color-ai)" }[tone];
  return (
    <div className="relative grid shrink-0 place-items-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--color-surface-strong)" strokeWidth={stroke} />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={stroke} strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - v)} style={{ transition: "stroke-dashoffset .6s cubic-bezier(.2,.7,.2,1)" }} />
      </svg>
      <div className="absolute inset-0 grid place-items-center">{children}</div>
    </div>
  );
}

export function Bar({ value, tone = "accent" }: { value: number; tone?: "accent" | "ai" | "home" | "muted" }) {
  const bg = { accent: "bg-accent", ai: "bg-ai", home: "bg-home", muted: "bg-text-muted" }[tone];
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-strong">
      <div className={`h-full rounded-full ${bg}`} style={{ width: `${Math.round(Math.max(0, Math.min(1, value)) * 100)}%`, transition: "width .5s" }} />
    </div>
  );
}

const FAMILY: { test: RegExp; bg: string; fg: string }[] = [
  { test: /^(claude|anthropic)$/, bg: "#d97757", fg: "#fff" },
  { test: /^(codex|openai)$/, bg: "#1f1f1f", fg: "#fff" },
  { test: /^(antigravity|gemini|google)$/, bg: "#3d6fe0", fg: "#fff" },
  { test: /^(xai)$/, bg: "#555", fg: "#fff" },
  { test: /^(deepseek|kimi|openrouter)$/, bg: "#4a5568", fg: "#fff" },
];

/** A recipe's mark: the vendor's colour with the model's initial; local models get a house. */
export function RecipeMark({ recipe, size = 32 }: { recipe: Pick<Recipe, "cli" | "label"> | undefined; size?: number }) {
  if (!recipe) return <div className="shrink-0 rounded-[9px] bg-surface-strong" style={{ width: size, height: size }} />;
  const local = recipe.cli === "ollama";
  const f = FAMILY.find((x) => x.test.test(recipe.cli));
  const style = local
    ? { background: "var(--color-home-soft)", color: "var(--color-home)" }
    : { background: f?.bg ?? "#6b7280", color: f?.fg ?? "#fff" };
  return (
    <div className="grid shrink-0 place-items-center rounded-[9px] font-semibold" style={{ width: size, height: size, fontSize: size * 0.44, ...style }}>
      {local ? <House style={{ width: size * 0.5, height: size * 0.5 }} strokeWidth={2.2} /> : (recipe.label.match(/[A-Za-z]/)?.[0] ?? "?").toUpperCase()}
    </div>
  );
}

export function RecipeTags({ r }: { r: Pick<Recipe, "prompt" | "context" | "tools"> }) {
  const t = [r.prompt !== "plain" ? `${r.prompt} prompt` : "plain prompt", r.context === "domain" ? "vault context" : "no context", r.tools === "web" ? "web" : "no tools"];
  return <span className="text-[12px] text-text-muted">{t.join(" · ")}</span>;
}

export function PageHeader({ title, sub, right }: { title: string; sub?: ReactNode; right?: ReactNode }) {
  return (
    <header className="mb-6 flex items-end justify-between gap-6">
      <div className="min-w-0">
        <h1 className="display text-[34px] leading-[1.1] font-semibold text-text-primary">{title}</h1>
        {sub && <p className="mt-1.5 max-w-[62ch] text-[14.5px] text-text-secondary">{sub}</p>}
      </div>
      {right && <div className="flex shrink-0 items-center gap-2">{right}</div>}
    </header>
  );
}

export function Empty({ icon, title, body, action }: { icon: ReactNode; title: string; body: string; action?: ReactNode }) {
  return (
    <div className="card rise flex flex-col items-center px-8 py-14 text-center">
      <div className="mb-4 grid h-14 w-14 place-items-center rounded-2xl bg-accent-soft text-accent">{icon}</div>
      <h2 className="display text-[22px] font-semibold">{title}</h2>
      <p className="mt-1.5 max-w-[46ch] text-[14px] text-text-secondary">{body}</p>
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function Section({ title, right, children }: { title: string; right?: ReactNode; children: ReactNode }) {
  return (
    <section className="mt-8">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-[15px] font-semibold text-text-primary">{title}</h2>
        {right}
      </div>
      {children}
    </section>
  );
}

export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="block">
      <div className="mb-1.5 text-[13px] font-medium text-text-secondary">{label}</div>
      {children}
      {hint && <div className="mt-1 text-[12px] text-text-muted">{hint}</div>}
    </label>
  );
}

export function Kbd({ children }: { children: ReactNode }) {
  return <kbd className="num inline-grid h-5 min-w-5 place-items-center rounded-md border border-border bg-surface-warm px-1 text-[11px] font-medium text-text-secondary">{children}</kbd>;
}
