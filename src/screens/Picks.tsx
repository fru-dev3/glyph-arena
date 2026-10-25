import { Check, CircleCheck, Equal, Flag, FlaskConical, Sparkles, Swords, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { arena, type Card, type Reveal } from "../api";
import { useArena } from "../App";
import { Button, Chip, Empty, Kbd, leagueText, money, PageHeader, RecipeMark, secs, Select } from "../ui";

const FLAG_KINDS = [
  ["hallucination", "Made something up"],
  ["wrong_number", "Wrong number"],
  ["unsafe_advice", "Unsafe advice"],
  ["privacy", "Privacy problem"],
  ["other", "Other"],
] as const;

export function PicksScreen() {
  const { status, reload, go } = useArena();
  const [card, setCard] = useState<Card | null | undefined>(undefined);
  const [reveal, setReveal] = useState<Reveal | null>(null);
  const [flagging, setFlagging] = useState<"a" | "b" | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const shownAt = useRef(0);
  const recipes = new Map(status!.recipes.map((r) => [r.id, r]));

  const load = useCallback(async () => {
    setReveal(null);
    setFlagging(null);
    const c = await arena<Card | null>(["pick", "next"]);
    setCard(c);
    shownAt.current = performance.now();
    setElapsed(0);
  }, []);
  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    if (!card || reveal) return;
    const t = setInterval(() => setElapsed(performance.now() - shownAt.current), 50);
    return () => clearInterval(t);
  }, [card, reveal]);

  const submit = useCallback(async (choice: "left" | "right" | "tie") => {
    if (!card || reveal) return;
    const ms = Math.round(performance.now() - shownAt.current);
    const r = await arena<Reveal>(["pick", "submit", card.duel, choice, "--left", card.left, "--ms", String(ms)]);
    setReveal(r);
    void reload();
  }, [card, reveal, reload]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || (e.target as HTMLElement)?.tagName === "SELECT") return;
      if (!reveal) {
        if (e.key === "1" || e.key === "ArrowLeft") void submit("left");
        else if (e.key === "2" || e.key === "ArrowRight") void submit("right");
        else if (e.key === "=" || e.key === "0" || e.key === "ArrowDown") void submit("tie");
      } else if ((e.key === "Enter" || e.key === " ") && !flagging) { e.preventDefault(); void load(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [submit, reveal, load, flagging]);

  const flag = async (side: "a" | "b", kind: string, severity: string) => {
    if (!reveal) return;
    await arena(["flag", reveal.duel, side, "--kind", kind, "--severity", severity, "--what", `flagged in a blind pick: ${kind.replace("_", " ")}`]);
    setFlagging(null);
    void reload();
  };

  const ub = status!.policy?.unblinding;
  const header = (
    <PageHeader
      title="Blind picks"
      sub="Two answers to one of your own tasks, names hidden. Pick the better one; two seconds is usually enough. Only duels the checkers could not settle land here."
      right={
        <>
          {card && <Chip tone="accent">{card.queue} waiting</Chip>}
          {ub?.score != null && <Chip tone="ai" title="How often the blind winner was the recipe the policy already routes">Unblinding {Math.round(ub.score * 100)}%</Chip>}
        </>
      }
    />
  );

  if (card === undefined) return header;
  if (card === null) {
    return (
      <>
        {header}
        <Empty
          icon={<CircleCheck className="h-7 w-7" />}
          title="Nothing to pick"
          body="Every duel so far was settled by a checker, by agreement, or by you. Run a ghost replay to get new ones."
          action={<Button kind="primary" size="lg" onClick={() => go("run")} icon={<FlaskConical className="h-4 w-4" />}>Run a replay</Button>}
        />
      </>
    );
  }

  const sideOf = (pos: "left" | "right"): "a" | "b" => (pos === "left" ? card.left : card.left === "a" ? "b" : "a");
  const progress = Math.min(1, elapsed / 2000);

  return (
    <>
      {header}
      <div className="card mb-4 px-5 py-4">
        <div className="mb-1.5 flex items-center gap-2 text-[12px] text-text-muted"><Sparkles className="h-3.5 w-3.5" />{leagueText(card.league)}</div>
        <p className="selectable line-clamp-3 text-[15.5px] leading-relaxed font-medium">{card.prompt}</p>
      </div>

      <div className="grid grid-cols-2 gap-4">
        {(["left", "right"] as const).map((pos, i) => {
          const side = sideOf(pos);
          const text = pos === "left" ? card.left_text : card.right_text;
          const info = reveal ? (side === "a" ? reveal.a : reveal.b) : null;
          const won = reveal && !reveal.tie && reveal.winner === info?.recipe;
          return (
            <div key={pos} className={`card flex min-h-0 flex-col overflow-hidden transition-all ${won ? "ring-2 ring-accent" : ""}`}>
              <div className="flex h-12 items-center justify-between border-b border-border-subtle px-4">
                {reveal && info ? (
                  <div className="flex min-w-0 items-center gap-2.5">
                    <RecipeMark recipe={recipes.get(info.recipe) ?? { cli: "", label: info.label }} size={26} />
                    <span className="truncate text-[14px] font-semibold">{info.label}</span>
                    <span className="num text-[12px] text-text-muted">{money(info.cost_usd)} · {secs(info.ms)}</span>
                  </div>
                ) : (
                  <div className="flex items-center gap-2 text-[13px] font-medium text-text-secondary"><Kbd>{i + 1}</Kbd> Answer {i === 0 ? "one" : "two"}</div>
                )}
                {won && <Chip tone="accent" icon={<Check className="h-3.5 w-3.5" />}>Your pick</Chip>}
              </div>
              <div className="scroll selectable max-h-[calc(100vh-420px)] min-h-[180px] px-5 py-4 text-[14px] leading-[1.65] whitespace-pre-wrap text-text-primary">{text}</div>
              {reveal && (
                <div className="flex items-center justify-end border-t border-border-subtle px-3 py-2">
                  {flagging === side ? (
                    <FlagForm onCancel={() => setFlagging(null)} onFlag={(k, s) => flag(side, k, s)} />
                  ) : (
                    <Button kind="ghost" size="sm" icon={<Flag className="h-3.5 w-3.5" />} onClick={() => setFlagging(side)}>Flag this answer</Button>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="mt-5 flex flex-col items-center gap-3">
        {!reveal ? (
          <>
            <div className="flex items-center gap-3">
              <Button size="lg" onClick={() => submit("left")} icon={<Kbd>1</Kbd>}>Left is better</Button>
              <Button size="lg" onClick={() => submit("tie")} icon={<Equal className="h-4 w-4" />}>Even</Button>
              <Button size="lg" onClick={() => submit("right")} icon={<Kbd>2</Kbd>}>Right is better</Button>
            </div>
            <div className="h-1 w-[280px] overflow-hidden rounded-full bg-surface-strong" title="Two seconds">
              <div className={`h-full rounded-full ${progress < 1 ? "bg-accent" : "bg-text-muted/40"}`} style={{ width: `${progress * 100}%` }} />
            </div>
          </>
        ) : (
          <div className="flex items-center gap-3">
            {reveal.agrees_with_policy === true && <Chip tone="accent" icon={<Check className="h-3.5 w-3.5" />}>Same as the policy</Chip>}
            {reveal.agrees_with_policy === false && <Chip tone="warn" icon={<Swords className="h-3.5 w-3.5" />}>Overturns the current route</Chip>}
            {reveal.tie && <Chip>Even</Chip>}
            <Button kind="primary" size="lg" onClick={() => load()}>Next pick <Kbd>Enter</Kbd></Button>
          </div>
        )}
      </div>
    </>
  );
}

function FlagForm({ onFlag, onCancel }: { onFlag: (kind: string, severity: string) => void; onCancel: () => void }) {
  const [kind, setKind] = useState<string>("hallucination");
  const [sev, setSev] = useState("major");
  return (
    <div className="flex items-center gap-2">
      <Select value={kind} onChange={setKind}>{FLAG_KINDS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</Select>
      <Select value={sev} onChange={setSev}>
        <option value="minor">Minor</option>
        <option value="major">Major</option>
        <option value="severe">Severe</option>
      </Select>
      <Button kind="danger" size="sm" onClick={() => onFlag(kind, sev)} icon={<Flag className="h-3.5 w-3.5" />}>Flag</Button>
      <Button kind="ghost" size="sm" onClick={onCancel} icon={<X className="h-3.5 w-3.5" />} title="Cancel" />
    </div>
  );
}
