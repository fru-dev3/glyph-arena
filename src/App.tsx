import { FlaskConical, Layers, Route as RouteIcon, Settings, ShieldCheck, Swords, Trophy, Wallet } from "lucide-react";
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { arena, type Status } from "./api";
import { ArenaMark } from "./mark";
import { LeaguesScreen } from "./screens/Leagues";
import { PicksScreen } from "./screens/Picks";
import { PolicyScreen } from "./screens/Policy";
import { RecipesScreen } from "./screens/Recipes";
import { RunScreen } from "./screens/Run";
import { SafetyScreen } from "./screens/Safety";
import { SettingsScreen } from "./screens/Settings";
import { money, Ring } from "./ui";

export type ScreenId = "policy" | "picks" | "leagues" | "run" | "recipes" | "safety" | "settings";

interface Ctx { status: Status | null; reload: () => Promise<void>; go: (s: ScreenId) => void; error: string | null }
const ArenaCtx = createContext<Ctx>({ status: null, reload: async () => {}, go: () => {}, error: null });
export const useArena = () => useContext(ArenaCtx);

const NAV: { id: ScreenId; label: string; icon: ReactNode }[] = [
  { id: "policy", label: "Policy", icon: <RouteIcon className="h-[18px] w-[18px]" /> },
  { id: "picks", label: "Blind picks", icon: <Swords className="h-[18px] w-[18px]" /> },
  { id: "leagues", label: "Leagues", icon: <Trophy className="h-[18px] w-[18px]" /> },
  { id: "run", label: "Run", icon: <FlaskConical className="h-[18px] w-[18px]" /> },
  { id: "recipes", label: "Recipes", icon: <Layers className="h-[18px] w-[18px]" /> },
  { id: "safety", label: "Safety", icon: <ShieldCheck className="h-[18px] w-[18px]" /> },
  // Settings is the gear in the header, never a second row for the same thing.
];

// Every screen, not just the ones with a nav row: Settings is reached by the gear
// and by #settings, and a deep link to it has to keep working.
const SCREENS: ScreenId[] = [...NAV.map((n) => n.id), "settings"];
function initialScreen(): ScreenId {
  const h = location.hash.replace("#", "") as ScreenId;
  return SCREENS.includes(h) ? h : "policy";
}

export default function App() {
  const [screen, setScreen] = useState<ScreenId>(initialScreen);
  const [status, setStatus] = useState<Status | null>(null);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    try {
      setStatus(await arena<Status>(["status"]));
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);
  useEffect(() => { void reload(); }, [reload]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.metaKey && !e.shiftKey && !e.altKey)) return;
      const i = Number(e.key) - 1;
      if (i >= 0 && i < NAV.length) { e.preventDefault(); setScreen(NAV[i]!.id); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  useEffect(() => { history.replaceState(null, "", `#${screen}`); }, [screen]);
  useEffect(() => {
    const onHash = () => setScreen(initialScreen());
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  const ctx = useMemo(() => ({ status, reload, go: setScreen, error }), [status, reload, error]);
  const pending = status?.counts.pending ?? 0;
  const spent = status?.budget.spent_usd ?? 0;
  const cap = status?.budget.cap_usd ?? 0;
  const frac = cap > 0 ? spent / cap : 0;

  return (
    <ArenaCtx.Provider value={ctx}>
      <div className="flex h-full">
        <aside className="drag flex w-[232px] shrink-0 flex-col border-r border-border-subtle bg-sidebar px-3 pt-11 pb-3 max-[960px]:w-[68px]">
          {/* Icon, name, spacer, gear, one line: the icon and the name already say
              which app this is, so no tagline under them (Fru, 2026-10-31). */}
          <div className="nodrag mb-6 flex items-center gap-2.5 px-2 max-[960px]:justify-center max-[960px]:px-0">
            <ArenaMark size={30} />
            <div className="display truncate text-[17px] font-semibold max-[960px]:hidden">Glyph Arena</div>
            <div className="flex-1 max-[960px]:hidden" />
            <button
              onClick={() => setScreen("settings")}
              title="Settings"
              aria-label="Settings"
              className={`grid h-7 w-7 shrink-0 place-items-center rounded-lg transition-colors max-[960px]:hidden ${
                screen === "settings" ? "bg-surface text-accent" : "text-text-muted hover:bg-surface/60 hover:text-text-primary"
              }`}
            >
              <Settings className="h-4 w-4" />
            </button>
          </div>
          <nav className="nodrag flex flex-col gap-0.5">
            {NAV.map((n, i) => {
              const on = screen === n.id;
              return (
                <button
                  key={n.id}
                  onClick={() => setScreen(n.id)}
                  title={`${n.label} (Cmd ${i + 1})`}
                  className={`group flex h-9 items-center gap-3 rounded-[10px] px-2.5 text-[14px] transition-colors max-[960px]:justify-center max-[960px]:px-0 ${
                    on ? "bg-surface font-medium text-text-primary shadow-[0_1px_2px_rgba(0,0,0,.06)]" : "text-text-secondary hover:bg-surface/60 hover:text-text-primary"
                  }`}
                >
                  <span className={on ? "text-accent" : "text-text-muted group-hover:text-text-secondary"}>{n.icon}</span>
                  <span className="flex-1 text-left max-[960px]:hidden">{n.label}</span>
                  {n.id === "picks" && pending > 0 && (
                    <span className="num grid h-5 min-w-5 place-items-center rounded-full bg-accent px-1.5 text-[11px] font-semibold text-on-accent max-[960px]:hidden">{pending}</span>
                  )}
                </button>
              );
            })}
          </nav>
          <div className="flex-1" />
          <button onClick={() => setScreen("settings")} className="nodrag flex items-center gap-3 rounded-xl border border-border-subtle bg-surface/70 p-2.5 text-left max-[960px]:justify-center max-[960px]:border-0 max-[960px]:bg-transparent max-[960px]:p-0" title={`Spent this month against the monthly cap`}>
            <Ring value={frac} size={38} stroke={4.5} tone={frac > 0.9 ? "err" : frac > 0.7 ? "warn" : "accent"}>
              <Wallet className="h-3.5 w-3.5 text-text-muted" />
            </Ring>
            <div className="num min-w-0 truncate text-[13px] font-medium max-[960px]:hidden">
              {money(spent)} <span className="text-text-muted">of ${cap.toFixed(0)}</span>
            </div>
          </button>
        </aside>

        <main className="scroll relative flex-1">
          <div className="drag absolute inset-x-0 top-0 h-10" />
          <div className="mx-auto w-full max-w-[1120px] px-10 pt-12 pb-16 max-[960px]:px-6">
            {error && !status ? (
              <div className="card p-6 text-[14px]">
                <div className="font-semibold text-err">Arena could not start</div>
                <p className="mt-1 text-text-secondary">{error}</p>
              </div>
            ) : !status ? (
              <div className="grid h-[60vh] place-items-center text-text-muted">Opening your vault...</div>
            ) : (
              <div key={screen} className="rise">
                {screen === "policy" && <PolicyScreen />}
                {screen === "picks" && <PicksScreen />}
                {screen === "leagues" && <LeaguesScreen />}
                {screen === "run" && <RunScreen />}
                {screen === "recipes" && <RecipesScreen />}
                {screen === "safety" && <SafetyScreen />}
                {screen === "settings" && <SettingsScreen />}
              </div>
            )}
          </div>
        </main>
      </div>
    </ArenaCtx.Provider>
  );
}
