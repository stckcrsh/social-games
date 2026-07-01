# Wrastlin — Operator Guide

Wrastlin is a weekly wrestling manager game. Each player controls a manager who directs a wrestler. Every week players submit booking requests and bribes, the AI generates a full show, players bet on outcomes during a live event, and the AI judge resolves bets and pays out winnings.

For deep technical detail on the backend pipeline, agents, and scenarios: see [`apps/wrastlin/meta-service/CLAUDE.md`](meta-service/CLAUDE.md).

---

## Services

| Service | NX project | Port | What it does |
|---------|-----------|------|--------------|
| `apps/wrastlin/meta-service` | `wrastlin-service` | 3002 | Fastify API — auth, submissions, show generation, betting, judge |
| `apps/wrastlin/game` | `@org/wrastlin-game` | 5173 | React + Vite player UI |

### Starting services

```bash
pnpm nx serve wrastlin-service     # API server (builds then starts)
pnpm nx serve @org/wrastlin-game   # Player UI (Vite dev server)
```

### Environment setup

```bash
cp apps/wrastlin/meta-service/.env.example apps/wrastlin/meta-service/.env
# Fill in: OPENAI_API_KEY, JWT_SECRET (min 16 chars), ELEVENLABS_API_KEY (TTS, not yet wired)
```

---

## Testing

### Unit and integration tests

```bash
pnpm nx test wrastlin-service      # all vitest tests for the meta-service
pnpm nx run-many -t test           # all projects in the workspace
```

Tests live alongside source files (`*.spec.ts`). Fastify route tests use `app.inject()`. Pure logic tests use real inputs — mocks only at process/filesystem/network boundaries.

### Prompt engineering tests (promptfoo)

```bash
pnpm nx run wrastlin-service:promptfoo
```

Tests the show outline prompt against named scenarios using the real rendering pipeline — same `buildVariables` + `loadPrompt` code that runs in production. Results show pass/fail for structural rules (valid JSON, segment counts, headliner placement) and LLM-rubric assertions (booking priority honored, promo goals coherent).

**Scenarios** live in `data/scenarios/outline/<name>/`:

| File | Purpose |
|------|---------|
| `wrestlers.json` | Full `Wrestler[]` array |
| `managers.json` | `Manager[]` — maps managerId → wrestlerId |
| `submissions.json` | `WeeklySubmission[]` for the week |
| `thoughtProcess.json` | `WrestlerThoughtProcessOutput[]` — wrestler inner monologues (placeholder data for now) |
| `threads.json` | `RetrievedThread[]` — active story threads (placeholder `[]` for now) |

**Current scenarios:**

| Scenario | What it tests |
|----------|--------------|
| `stacked-requests` | Two managers stack bribes on the same matchup — expect stacking bonus to win headliner |
| `bribing` | Escalating bribes; m-007 bids $2000 — expect Golden Tyrant in the main event 8/10 runs |
| `interference-prone` | Rookie Blaze just turned heel; expect interference or storyline acknowledgement |

**Adding a new scenario:**
1. Create `data/scenarios/outline/<name>/` with the five required files
2. Add a test case to `promptfoo/promptfooconfig.yaml` pointing at the new folder

---

## Weekly loop

The phase cycle enforced by the state machine:

```
submissions_open → submissions_closed → show_generated → week_advanced → submissions_open
```

### Step 1 — Close submissions

Players have submitted their booking requests. Lock the window.

```bash
pnpm nx run wrastlin-service:close-submissions
```

### Step 2 — Generate show

Run the AI pipeline: wrestler thought process → show outline → match beats + promo screenplays → announcer screenplays.

```bash
# Full real run (requires OPENAI_API_KEY)
pnpm nx run wrastlin-service:generate-show

# Stub run (no AI calls — useful for testing the pipeline structure)
pnpm nx run wrastlin-service:generate-show -- --stub --skip-tts

# Force-run bypassing phase check (dev/testing)
pnpm nx run wrastlin-service:generate-show -- --force --stub --skip-tts

# Use scenario data instead of live game state
pnpm nx run wrastlin-service:generate-show -- --force --stub --skip-tts --scenario bribing

# Resume a failed run from checkpoint
pnpm nx run wrastlin-service:generate-show -- --resume data/runs/<runId>.jsonl
```

**Inspecting prompts from a previous run:**
```bash
pnpm nx run wrastlin-service:print-prompt
```

### Step 3 — Open betting

Open the betting window before the live event starts. Players create propositions and place bets while the show plays.

```bash
pnpm nx run wrastlin-service:open-betting
```

### Step 4 — Close betting

Lock the betting window after the show ends.

```bash
pnpm nx run wrastlin-service:close-betting
```

### Step 5 — Run judge

The AI judge reads each proposition against the generated show JSON and determines winners. Ambiguous propositions are flagged for manual resolution.

```bash
pnpm nx run wrastlin-service:run-judge

# Manually resolve a flagged proposition
pnpm nx run wrastlin-service:resolve-proposition -- --id <propositionId> --winning-option <optionId>
```

### Step 6 — Apply payouts

Write winning amounts to managers' money balances.

```bash
pnpm nx run wrastlin-service:apply-payouts
```

### Step 7 — Advance week

Increment the week counter and return to `submissions_open`.

```bash
pnpm nx run wrastlin-service:advance-week
```

---

## Testing agents in isolation

Each agent stage can be run against a scenario without going through the full pipeline:

```bash
# Show outline
pnpm nx run wrastlin-service:run-outline -- --scenario stacked-requests
pnpm nx run wrastlin-service:run-outline -- --scenario stacked-requests --stub
pnpm nx run wrastlin-service:run-outline -- --scenario stacked-requests --print-prompt

# Match beats
pnpm nx run wrastlin-service:run-beats -- --scenario cage-match-headliner

# Promo screenplay
pnpm nx run wrastlin-service:run-promo -- --scenario <name>

# Announcer screenplay
pnpm nx run wrastlin-service:run-announcer -- --scenario <name>
```

Beats, promo, and announcer scenarios are single `.json` files in `data/scenarios/<type>/<name>.json`.

---

## Game status

See [`GAME_STATUS.md`](GAME_STATUS.md) for what's built, what's stubbed, and what's needed to run a real session.
