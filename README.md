# Glyph Arena

**Find out which AI recipe is best for your own work, on your own tasks.**

Glyph Arena is the lab of the [Glyph](https://glyph.fru.dev) family. It replays the
tasks you actually gave your AI tools, runs them on two *recipes* at a time (a recipe is
a model plus its prompt style, vault context and tools), and writes a routing policy
that [Glyph Studio](https://github.com/fru-dev3/glyph-studio) follows: which recipe to
use for which kind of task, with a sentence on why.

- **Ghost replays** of your own past prompts, sorted into leagues by domain, kind of
  task (drafting, decisions, research, planning, video scripts, coding) and weight class.
- **Cheapest honest verdict first**: a mechanical checker (a number that must reconcile,
  valid JSON, code that passes tests, a word limit), then agreement between the answers,
  then a judge for questions with a known answer, and only then a **two-second blind
  pick** by you. The unblinding score shows how often your blind pick matched the
  current route.
- **Equivalent, use the cheaper**: when two recipes are even, the cheaper one gets the route.
- **Home Only league**: health and money domains run on local models only (Ollama on
  your own machines), refused before any call, never sent.
- **Adverse-event register**: flag an answer that made something up or gave unsafe
  advice; one severe event, or two major ones in 30 days, suspends that model in that
  domain for 30 days.
- **Monthly spend cap** checked before every cloud call; **weekly sentinels** catch a
  model that silently got worse; **scouting** lists new local models and the web
  scout's picks as challengers.

Everything is plain files in your vault, under `build/_meta/arena/`: `recipes.json`,
`duels.jsonl`, `picks.jsonl`, `adverse.jsonl`, `spend.jsonl`, and the result,
`policy.json` with its readable twin `policy.md`.

## How it fits together

Arena's logic lives in [glyph-engine](https://github.com/fru-dev3/glyph-engine)
(`src/arena`), next to the model providers it uses, so there is one implementation.
This app is the interface: a Tauri shell that runs the engine's `arena-engine` sidecar,
a separate program (GPL-3.0, source in glyph-engine). Studio's Auto router reads
`policy.json` from the same vault. Nothing here needs Studio installed.

## Build

Needs Rust, Node, [Bun](https://bun.sh) and a checkout of glyph-engine.

```sh
npm install
ENGINE_DIR=../glyph-engine bash scripts/prepare-sidecar.sh   # or ENGINE_REF=main to clone it
npx tauri build
```

For UI work in a browser: `node scripts/demo-vault.mjs /tmp/arena-demo`, then
`ARENA_VAULT=/tmp/arena-demo bun scripts/dev-bridge.ts` and `npm run dev`. The demo vault
is entirely made up.

## License

MIT for this app. The bundled `arena-engine` is built from glyph-engine (GPL-3.0).
