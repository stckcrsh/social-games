# Wrastlin E2E Betting Tests + Data Separation Design

**Date:** 2026-03-10
**Status:** Approved

---

## Overview

Two goals:

1. **Data separation** — split wrastlin-service data files into `static/` (developer-owned, committed) and `runtime/` (runtime state, gitignored), driven by `STATIC_DATA_DIR` and `DYNAMIC_DATA_DIR` env vars.
2. **E2e API tests** — Playwright API-level tests for the betting routes against a real running wrastlin-service instance using isolated test data. Browser (UI) tests are stubbed and deferred until the betting UI is built.

The data separation pattern is designed for wrastlin-service first; dungeon may adopt the same convention later.

---

## Data Separation

### Classification

| Category | Files | Who changes it |
|----------|-------|----------------|
| **Static (seed)** | `data/static/wrestlers.json`, `data/static/managers.json` | Developer |
| **Dynamic** | `data/runtime/wrestlers.json` (emotions), `data/runtime/managers.json` (money), `data/runtime/state.json`, `data/runtime/bets/propositions.json`, `data/runtime/bets/entries.json`, `data/runtime/submissions/week-N.json`, `data/runtime/shows/week-N.json` | Runtime / service |

Both wrestlers and managers are seeded from static files but develop mutable runtime state (emotions for wrestlers, money for managers). The dynamic copy takes precedence at startup once it exists (see Startup Resolution below).

`data/runtime/` is added to `.gitignore`. `data/static/` is committed.

### File Moves

| Old path | New path |
|----------|----------|
| `data/wrestlers.json` | `data/static/wrestlers.json` |
| `data/managers.json` | `data/static/managers.json` |
| `data/state.json` | `data/runtime/state.json` |
| `data/bets/propositions.json` | `data/runtime/bets/propositions.json` |
| `data/bets/entries.json` | `data/runtime/bets/entries.json` |
| `data/submissions/` | `data/runtime/submissions/` |
| `data/shows/` | `data/runtime/shows/` |

### persistence.ts Changes

Two configurable data roots driven by env vars, with defaults relative to `__dirname`:

```typescript
const STATIC_DIR = process.env.STATIC_DATA_DIR
  ?? path.resolve(__dirname, '../data/static');
const DYNAMIC_DIR = process.env.DYNAMIC_DATA_DIR
  ?? path.resolve(__dirname, '../data/runtime');
```

The build is a single-file bundle (`src/main.ts` → `dist/main.js`), so `__dirname` at runtime is `<meta-service>/dist/`. One `..` up resolves to `<meta-service>/`, giving `<meta-service>/data/static` and `<meta-service>/data/runtime`.

Three exported functions replace the current `readJson` / `writeJson`:

```typescript
export function readStaticJson<T>(filename: string): T
export function readDynamicJson<T>(filename: string): T
export function writeDynamicJson<T>(filename: string, data: T): void
```

`writeStaticJson` does not exist — static data is never written by the service.

`readJsonOrDefault` is kept but updated to accept an optional `dir: 'static' | 'dynamic'` parameter (defaults to `'dynamic'`). Check for existing callers before updating the signature.

### Callers to Update

**`gameState.ts`:**
- `loadWrestlers`, `loadManagers` → `readStaticJson`
- `saveWrestlers` → `writeDynamicJson` (wrestler emotional state is mutated post-show by `showGenerator.ts`; the static file holds the seed, the dynamic copy holds live state)
- `saveManagers` → `writeDynamicJson` (money changes during play)
- All other load/save functions → `readDynamicJson` / `writeDynamicJson`

**`loadWrestlers` startup resolution:** Same pattern as managers — check `DYNAMIC_DATA_DIR/wrestlers.json` first, fall back to `readStaticJson('wrestlers.json')` if absent. `saveWrestlers` always writes to `DYNAMIC_DATA_DIR/wrestlers.json`.

**`betService.ts`:**
- `loadPropositions`, `loadEntries` → `readDynamicJson`
- `savePropositions`, `saveEntries` → `writeDynamicJson`
- `deductMoney`, `creditMoney` → already delegate to `gameState`, no change needed

**Note on `saveManagers`:** Managers have both static identity fields (`managerId`, `wrestlerId`, `trustLevel`) and dynamic runtime fields (`money`). The full manager record lives in `data/static/managers.json` as the seed, but `saveManagers` writes to `DYNAMIC_DATA_DIR`. This means after a manager's money changes, the updated record is in `runtime/` rather than `static/`. At startup the service loads from static; if a runtime copy exists, it takes precedence (see Startup Resolution below).

### Startup Resolution

Both wrestlers and managers are seeded from static files but have mutable runtime state. The same pattern applies to both:

- `loadManagers()` checks `DYNAMIC_DATA_DIR/managers.json` first; falls back to `readStaticJson('managers.json')` if absent. `saveManagers()` always writes to `DYNAMIC_DATA_DIR/managers.json`.
- `loadWrestlers()` checks `DYNAMIC_DATA_DIR/wrestlers.json` first; falls back to `readStaticJson('wrestlers.json')` if absent. `saveWrestlers()` always writes to `DYNAMIC_DATA_DIR/wrestlers.json`.

This means:
- Fresh start (no runtime copy): loads static seed
- After any mutation (money change, emotion update): runtime copy takes over
- E2e test reset: deleting `runtime/managers.json` and `runtime/wrestlers.json` restores to seed state

---

## E2e Test Infrastructure

### Location

`apps/wrastlin/wrastlin-ui-e2e/` — currently a placeholder package. Gets a full Playwright setup.

### New Files

```
apps/wrastlin/wrastlin-ui-e2e/
  playwright.config.ts
  project.json
  tsconfig.json
  src/
    global-setup.ts
    global-teardown.ts
    betting.api.spec.ts
    browser/              # placeholder for future UI tests
```

### playwright.config.ts

```typescript
// One webServer: wrastlin-service on port 3002
// STATIC_DATA_DIR and DYNAMIC_DATA_DIR point to temp test dirs
// reuseExistingServer: false (always start fresh)
// url: 'http://localhost:3002/health' for ready check
// Two test projects: 'api' (active) and 'chromium' (stubbed/skipped)
// workers: 1 (prevents races between test-file resets and in-flight server reads)
```

The webServer block:
```typescript
{
  command: 'node scripts/build.js && node dist/main.js',
  cwd: path.resolve(__dirname, '../../meta-service'),
  url: 'http://localhost:3002/health',
  reuseExistingServer: false,
  env: {
    STATIC_DATA_DIR: '/tmp/wrastlin-e2e/static',
    DYNAMIC_DATA_DIR: '/tmp/wrastlin-e2e/runtime',
  },
}
```

`cwd` is required — without it, Playwright runs the command from the e2e package dir (`apps/wrastlin/wrastlin-ui-e2e/`) where `scripts/build.js` and `dist/` don't exist. `path.resolve(__dirname, '../../meta-service')` resolves correctly from the e2e package root.

### global-setup.ts

Runs before any tests:

1. Creates temp dirs: `/tmp/wrastlin-e2e/static/` and `/tmp/wrastlin-e2e/runtime/`
2. Copies fixture files to temp static dir using absolute paths derived from `__dirname` (e.g., `path.resolve(__dirname, '../../../meta-service/data/static/wrestlers.json')`)
3. Writes known-good `state.json` (week 1, `week_open`) to temp runtime dir
4. Writes empty `bets/propositions.json` and `bets/entries.json` to temp runtime dir

Fixture source paths must be absolute — relative paths are resolved from the working directory when Playwright runs setup, which may differ from the e2e package root.

### global-teardown.ts

Removes `/tmp/wrastlin-e2e/` after the full test run.

### project.json

```json
{
  "name": "wrastlin-ui-e2e",
  "targets": {
    "e2e": {
      "executor": "nx:run-commands",
      "options": {
        "command": "pnpm playwright test",
        "cwd": "apps/wrastlin/wrastlin-ui-e2e"
      }
    }
  },
  "implicitDependencies": ["wrastlin-service"]
}
```

---

## Betting API E2e Tests (`betting.api.spec.ts`)

All tests use Playwright's `request` fixture — HTTP only, no browser.

### Test Groups

**Proposition creation:**
- Happy path: `POST /bets/propositions` with valid manager → 201, `status: 'open'`
- Phase guard: same request when phase is `submissions_closed` → 400

**Placing bets:**
- Happy path: `POST /bets/propositions/:id/entries` → 201, manager money reduced (verified via `GET /managers/m-001`)
- Insufficient funds: amount exceeds balance → 400
- View entries: `GET /bets/entries?bettorId=m-001` returns placed entry

**Full happy path (sequential):**
1. Create proposition (Rex vs Steel)
2. Manager m-001 bets 100 on Rex
3. `GET /bets/propositions/:id` → `pool.totalPot === 100`
4. `POST /bets/propositions/:id/resolve` with `winningOptionIds: ['opt-rex']`
5. `GET /managers/m-001` → `money === 1000` (1000 starting balance, -100 staked, +100 won back = 1000; this relies on m-001 being the sole bettor so they receive 100% of the pot)

**Phase enforcement:**
1. Create proposition and bet while `week_open`
2. `POST /state/close-submissions` → phase becomes `submissions_closed`
3. Attempt to place another bet → 400

### Test Isolation

A `beforeEach` in each `describe` block resets the runtime files (rewrites `state.json`, `propositions.json`, `entries.json` to their clean initial state) and calls `DELETE` on any server-side state if available, or directly overwrites the temp runtime files. Since the server is started once for the whole suite, the test data directory is writable by tests during the run.

---

## Deferred

- Browser (UI) Playwright tests for betting — deferred until betting UI is built in `apps/wrastlin/game`
- Dungeon data separation — same `STATIC_DATA_DIR` / `DYNAMIC_DATA_DIR` pattern, separate task
- `shows/` cleanup between test runs (shows are append-only week-N files; not needed for betting tests)

---

## File Map

| Path | Action | Contents |
|------|--------|----------|
| `apps/wrastlin/meta-service/src/data/persistence.ts` | Modify | Add `STATIC_DATA_DIR`/`DYNAMIC_DATA_DIR`, export `readStaticJson`, `readDynamicJson`, `writeDynamicJson` |
| `apps/wrastlin/meta-service/src/core/gameState.ts` | Modify | Use `readStaticJson` for seed loads; `saveWrestlers`/`saveManagers` → `writeDynamicJson`; `loadWrestlers`/`loadManagers` → runtime-first fallback (check dynamic dir, fall back to static seed) |
| `apps/wrastlin/meta-service/src/bets/betService.ts` | Modify | Use `readDynamicJson`/`writeDynamicJson` |
| `apps/wrastlin/meta-service/data/static/wrestlers.json` | Move from `data/wrestlers.json` | Wrestler seed data |
| `apps/wrastlin/meta-service/data/static/managers.json` | Move from `data/managers.json` | Manager seed data |
| `apps/wrastlin/meta-service/data/runtime/state.json` | Move from `data/state.json` | Game state |
| `apps/wrastlin/meta-service/data/runtime/bets/propositions.json` | Move from `data/bets/propositions.json` | Bet propositions |
| `apps/wrastlin/meta-service/data/runtime/bets/entries.json` | Move from `data/bets/entries.json` | Bet entries |
| `apps/wrastlin/meta-service/.gitignore` | Create/modify | Add `data/runtime/` |
| `apps/wrastlin/wrastlin-ui-e2e/playwright.config.ts` | Create | Playwright config: one webServer (wrastlin-service:3002), api + chromium(skipped) test projects |
| `apps/wrastlin/wrastlin-ui-e2e/project.json` | Create | NX e2e target, `implicitDependencies: ["wrastlin-service"]` |
| `apps/wrastlin/wrastlin-ui-e2e/tsconfig.json` | Create | Extends root tsconfig |
| `apps/wrastlin/wrastlin-ui-e2e/src/global-setup.ts` | Create | Create temp dirs, copy fixtures, write clean runtime state |
| `apps/wrastlin/wrastlin-ui-e2e/src/global-teardown.ts` | Create | Remove temp dirs |
| `apps/wrastlin/wrastlin-ui-e2e/src/betting.api.spec.ts` | Create | All API e2e tests for betting |
