import { Ban, CircleCheck, House, Lock, Plus, ShieldAlert, Undo2 } from "lucide-react";
import { useEffect, useState } from "react";
import { arena, type AdverseEvent } from "../api";
import { useArena } from "../App";
import { ago, Button, Chip, domainLabel, Field, PageHeader, Section, Select } from "../ui";

const SEV_TONE = { minor: "muted", major: "warn", severe: "err" } as const;
const KIND_TEXT: Record<string, string> = {
  hallucination: "Made something up", wrong_number: "Wrong number", unsafe_advice: "Unsafe advice", privacy: "Privacy problem",
  regression: "Sentinel regression", other: "Other", lift: "Suspension lifted",
};

export function SafetyScreen() {
  const { status, reload } = useArena();
  const s = status!;
  const [events, setEvents] = useState<AdverseEvent[] | null>(null);
  const [endpoints, setEndpoints] = useState<Record<string, boolean>>({});
  const [adding, setAdding] = useState(false);

  const load = () => arena<AdverseEvent[]>(["adverse"]).then(setEvents);
  useEffect(() => {
    void load();
    void arena<{ cli: string; baseUrl?: string }[]>(["recipes", "runtimes"]).then((rts) => {
      const up: Record<string, boolean> = {};
      for (const e of s.config.home_endpoints) up[e] = rts.some((r) => r.baseUrl === e);
      setEndpoints(up);
    });
  }, [s.config.home_endpoints]);

  const lift = async (model: string, domain: string) => {
    await arena(["adverse", "lift", "--model", model, "--domain", domain]);
    await reload();
    await load();
  };
  const models = [...new Set(s.recipes.map((r) => r.model))];

  return (
    <>
      <PageHeader title="Safety" sub="The Home Only league keeps health and money on this Mac. The adverse-event register benches a model in a domain when it goes wrong there." />

      <div className="grid grid-cols-[1.1fr_1fr] gap-4 max-[1100px]:grid-cols-1">
        <div className="card p-5">
          <div className="mb-3 flex items-center gap-3">
            <div className="grid h-10 w-10 place-items-center rounded-xl bg-home-soft text-home"><House className="h-5 w-5" /></div>
            <div>
              <div className="text-[15px] font-semibold">Home Only league</div>
              <div className="text-[12.5px] text-text-muted">Local models only. Checked before every call, so nothing is ever sent.</div>
            </div>
          </div>
          <div className="mb-4 flex flex-wrap gap-1.5">
            {s.config.home_only.map((d) => <Chip key={d} tone="home" icon={<Lock className="h-3 w-3" />}>{domainLabel(d)}</Chip>)}
          </div>
          <div className="space-y-2">
            {s.config.home_endpoints.map((e) => (
              <div key={e} className="flex items-center justify-between rounded-xl bg-surface-warm px-3 py-2.5">
                <span className="num truncate text-[12.5px] text-text-secondary">{e}</span>
                <span className={`flex items-center gap-1.5 text-[12.5px] ${endpoints[e] ? "text-ok" : "text-text-muted"}`}>
                  <span className={`h-2 w-2 rounded-full ${endpoints[e] ? "bg-ok" : "bg-text-muted/40"}`} />
                  {endpoints[e] === undefined ? "checking" : endpoints[e] ? "answering" : "not running"}
                </span>
              </div>
            ))}
          </div>
          <p className="mt-3 text-[12.5px] text-text-muted">
            {s.home_recipes.length} local {s.home_recipes.length === 1 ? "recipe" : "recipes"}. A prompt with no domain that reads as health or money is treated as Home Only too.
          </p>
        </div>

        <div className="card p-5">
          <div className="mb-3 flex items-center gap-3">
            <div className="grid h-10 w-10 place-items-center rounded-xl bg-err-soft text-err"><Ban className="h-5 w-5" /></div>
            <div>
              <div className="text-[15px] font-semibold">Suspended</div>
              <div className="text-[12.5px] text-text-muted">One severe event, or two major ones in 30 days, benches a model in that domain for 30 days.</div>
            </div>
          </div>
          {s.suspended.length === 0 ? (
            <div className="flex items-center gap-2 rounded-xl bg-surface-warm px-3 py-3 text-[13.5px] text-text-secondary"><CircleCheck className="h-4 w-4 text-ok" />No model is suspended.</div>
          ) : (
            <div className="space-y-2">
              {s.suspended.map((x) => (
                <div key={`${x.model}|${x.domain}`} className="flex items-start gap-3 rounded-xl bg-surface-warm px-3 py-2.5">
                  <div className="min-w-0 flex-1">
                    <div className="text-[13.5px] font-medium">{x.model} <span className="font-normal text-text-muted">· {x.domain === "*" ? "every domain" : domainLabel(x.domain)} · until {x.until}</span></div>
                    <div className="text-[12.5px] text-text-secondary">{x.why}</div>
                  </div>
                  <Button size="sm" kind="ghost" icon={<Undo2 className="h-3.5 w-3.5" />} onClick={() => lift(x.model, x.domain)}>Lift</Button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <Section title="Adverse-event register" right={<Button size="sm" icon={<Plus className="h-4 w-4" />} onClick={() => setAdding((v) => !v)}>Add event</Button>}>
        {adding && <AddEvent models={models} domains={[...new Set([...s.domains, ...s.config.home_only])]} onDone={async () => { setAdding(false); await reload(); await load(); }} />}
        {!events ? null : events.length === 0 ? (
          <div className="card flex items-center gap-3 px-5 py-6 text-[14px] text-text-muted"><ShieldAlert className="h-5 w-5" />Nothing recorded. Flag an answer during a blind pick, or add one here.</div>
        ) : (
          <div className="card divide-y divide-border-subtle">
            {events.map((e, i) => (
              <div key={i} className="flex items-start gap-3 px-4 py-3">
                <div className={`mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ${e.kind === "lift" ? "bg-ok" : e.severity === "severe" ? "bg-err" : e.severity === "major" ? "bg-warn" : "bg-text-muted/50"}`} />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-[13.5px] font-medium">{KIND_TEXT[e.kind] ?? e.kind}</span>
                    {e.kind !== "lift" && <Chip tone={SEV_TONE[e.severity]}>{e.severity}</Chip>}
                    <span className="text-[12.5px] text-text-muted">{e.model} · {e.domain === "*" ? "every domain" : domainLabel(e.domain)} · {e.source}</span>
                  </div>
                  <div className="selectable text-[13px] text-text-secondary">{e.what}</div>
                </div>
                <span className="shrink-0 text-[12px] text-text-muted">{ago(e.ts)}</span>
              </div>
            ))}
          </div>
        )}
      </Section>
    </>
  );
}

function AddEvent({ models, domains, onDone }: { models: string[]; domains: string[]; onDone: () => void }) {
  const [model, setModel] = useState(models[0] ?? "");
  const [domain, setDomain] = useState("*");
  const [kind, setKind] = useState("hallucination");
  const [sev, setSev] = useState("major");
  const [what, setWhat] = useState("");
  const save = async () => {
    await arena(["adverse", "add", "--model", model, "--domain", domain, "--kind", kind, "--severity", sev, "--what", what || KIND_TEXT[kind]!]);
    onDone();
  };
  return (
    <div className="card rise mb-3 grid grid-cols-5 items-end gap-3 p-4 max-[1100px]:grid-cols-2">
      <Field label="Model"><Select wide value={model} onChange={setModel}>{models.map((m) => <option key={m}>{m}</option>)}</Select></Field>
      <Field label="Domain"><Select wide value={domain} onChange={setDomain}><option value="*">Every domain</option>{domains.map((d) => <option key={d} value={d}>{domainLabel(d)}</option>)}</Select></Field>
      <Field label="What went wrong"><Select wide value={kind} onChange={setKind}>{Object.entries(KIND_TEXT).filter(([k]) => k !== "lift" && k !== "regression").map(([k, l]) => <option key={k} value={k}>{l}</option>)}</Select></Field>
      <Field label="Severity"><Select wide value={sev} onChange={setSev}><option value="minor">Minor</option><option value="major">Major</option><option value="severe">Severe</option></Select></Field>
      <Button kind="primary" onClick={save}>Record</Button>
      <div className="col-span-5 max-[1100px]:col-span-2">
        <input value={what} onChange={(e) => setWhat(e.target.value)} placeholder="One line on what happened (optional)" className="h-9 w-full rounded-[10px] border border-border bg-surface px-3 text-[13.5px]" />
      </div>
    </div>
  );
}
