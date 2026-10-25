# Glyph Arena 0.1.0

The first Glyph Arena: the lab that decides which AI recipe Glyph Studio uses for each kind of task, tested on your own tasks.

- **Policy**: every route Studio follows, with its verdict (best, equivalent and cheaper, Home Only) and a sentence on why.
- **Blind picks**: two answers, names hidden, about two seconds each; only for duels no checker could settle. Shows an unblinding score.
- **Leagues**: domain by kind of task, with light, middle and heavy weight classes and ranked standings.
- **Run**: ghost replays of your past prompts, questions with a known answer, sentinels or your own tasks, on two recipes.
- **Recipes**: model plus prompt style, vault context and tools; scouted local models and the web scout's picks as challengers.
- **Safety**: the Home Only league (health and money on local models only, refused before any call) and the adverse-event register with per-domain suspensions.
- **Settings**: monthly spend cap, games before a route, judge, sentinels, provider keys shared with Glyph Studio.

Apple Silicon, macOS 13 or later. Signed and notarized. Arena's engine is built from glyph-engine (src/arena).
