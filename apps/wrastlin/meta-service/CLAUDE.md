# Wrastlin Meta-Service

NX project: `wrastlin-service` | Port: 3002 | Runtime: Node ESM (package.json has `"type": "module"`)

## NX Targets

| Target | What it does |
|--------|--------------|
| `build` | esbuild all entry points to `dist/` |
| `serve` | build + run `dist/main.js` (the Fastify server) |
| `test` | vitest |
| `run-outline` | Run the show outline agent against a named scenario |
| `generate-show` | Run the full pipeline (outline → beats → screenplays) |
| `open-betting` | curl shortcut — opens the betting window |
| `close-betting` | curl shortcut — closes the betting window |
| `run-judge` | Run the AI judge against generated show + propositions |
| `resolve-proposition` | Manually resolve a flagged proposition |
| `apply-payouts` | Write winning amounts to managers' balances |
| `promptfoo` | Run the promptfoo eval suite against outline scenarios |

Always use `pnpm nx run wrastlin-service:<target>` — never run scripts directly.

**Not currently NX targets**, despite source files existing in `src/`: `run-beats.ts`, `run-promo.ts`, `run-announcer.ts`, and `print-prompt.ts` are not in `scripts/build.cjs`'s entry-point list or in `project.json`, so there is no working `pnpm nx run wrastlin-service:<name>` for any of them yet. `close-submissions` and `advance-week` are not NX targets either — they're HTTP routes (`POST /state/close-submissions`, `POST /state/advance-week`) on the already-running server, invoked via `curl` (see `apps/wrastlin/CLAUDE.md` "Weekly loop").

## Agent Pipeline

Four sequential stages. Show outline runs first, then beats and screenplays run in parallel per segment:

```
show outline
    ↓
match beats (parallel per match segment)
promo screenplays (parallel per promo segment)
    ↓
announcer screenplays (parallel per match segment)
```

- **Show outline** — OpenAI (gpt-4o). Books the card: which wrestlers face each other, in what order, who does promos. Receives wrestler mindsets (`wrestlerThoughtProcess`) and active storyline threads.
- **Match beats** — OpenAI (gpt-4o). Generates the sequence of moves and the match result. Stub available via `--stub`.
- **Promo screenplays** — OpenAI (gpt-4o). Generates the promo dialogue; receives relevant story threads per-segment. Stub available via `--stub`.
- **Announcer screenplays** — stub only. Generates commentary over the match beats.

## Fault Tolerance

`generate-show` writes a JSONL run log to `data/runs/<runId>.jsonl`. Each agent result is written as it completes (outbox pattern). If the run fails mid-way, resume with:

```
pnpm nx run wrastlin-service:generate-show -- --stub --resume data/runs/<runId>.jsonl
```

`src/print-prompt.ts` can inspect the exact prompt from a previous run's JSONL log, but it isn't wired to an NX target yet (see "NX Targets" above). Use `run-outline`'s `--print-prompt` flag instead to inspect a prompt as it's rendered:

```
pnpm nx run wrastlin-service:run-outline -- --scenario <name> --print-prompt
```

## Scenario System

Scenarios are named folders of test data used by the per-agent wrapper scripts (`run-outline`, etc.). They exist so you can test an agent in isolation without needing live game state.

### Outline scenarios

Location: `data/scenarios/outline/<name>/`

Each scenario folder requires five files:

| File | Purpose |
|------|---------|
| `wrestlers.json` | Array of `Wrestler` objects |
| `managers.json` | Array of `Manager` objects — maps managerId → wrestlerId |
| `submissions.json` | Array of `WeeklySubmission` objects |
| `thoughtProcess.json` | `WrestlerThoughtProcessOutput[]` — wrestler inner monologues (can be placeholder data) |
| `threads.json` | `RetrievedThread[]` — active story threads (can be `[]` for no threads) |

**Critical**: `managers.json` is required. Without it, all submissions are silently dropped during the manager join in `buildShowOutlineInput` and the model receives an empty submissions array. The prompt will run but ignore all bribes and story requests.

Run a scenario:
```
pnpm nx run wrastlin-service:run-outline -- --scenario <name>         # real OpenAI
pnpm nx run wrastlin-service:run-outline -- --scenario <name> --stub  # stub agent
pnpm nx run wrastlin-service:run-outline -- --scenario <name> --print-prompt  # show rendered prompt
```

### Current scenarios

| Scenario | What it tests |
|----------|--------------|
| `stacked-requests` | 10 managers — m-001 and m-002 both request w-001 vs w-002, rest are neutral |
| `bribing` | 7 managers — escalating bribes ($100→$200→$300), one stacked zero-bribe pair, m-007 bids $2000 for the main event |
| `interference-prone` | Rookie Blaze (w-006) just turned heel and cost multiple wrestlers; expect interference or storyline acknowledgment |

### Other agent scenarios

Beats, promo, and announcer scenarios use a single `.json` file per scenario (not a folder):
- `data/scenarios/beats/<name>.json`
- `data/scenarios/promo/<name>.json`
- `data/scenarios/announcer/<name>.json`

## Booking Priority (show-outline prompt)

The prompt uses an explicit step-by-step algorithm — not soft weighting. Key rules:

1. Rank all match requests by `bribeAmount`. Stacked requests (two managers requesting the same matchup) add their bribeAmounts together.
2. Book highest-ranked request first, skip any where a wrestler is already booked.
3. Conflict resolution: if two managers request the same opponent, higher bribe wins.
4. Card position: highest effective bribe = headliner. Higher bribes appear later on the card.

This is intentionally algorithmic because soft language ("weight by bribeAmount") gets overridden by the model's storytelling instincts.

## State Machine

The weekly phase cycle:

```
submissions_open → submissions_closed → show_generated → week_advanced → submissions_open
```

`generate-show` requires phase `submissions_closed`. Use `--force` to bypass the check (writes state directly, skipping the transition validator):

```
pnpm nx run wrastlin-service:generate-show -- --force --stub --skip-tts
```

Use `--scenario <name>` to load test wrestlers/submissions instead of live game data:

```
pnpm nx run wrastlin-service:generate-show -- --force --stub --skip-tts --scenario bribing
```

## Build System

esbuild via `scripts/build.cjs`. All entry points are built to `dist/` as ESM. The alias map in build.cjs resolves `@org/wrastlin-shared` and `@org/betting` from source (no compiled lib step needed).

All dependencies live at the workspace root `package.json` — there is no `node_modules` inside the meta-service.

## Environment

Copy `.env.example` to `.env` and fill in:
- `OPENAI_API_KEY` — required for `run-outline` and `generate-show` without `--stub`
- `ELEVENLABS_API_KEY` — required for TTS (not yet wired into the pipeline)
