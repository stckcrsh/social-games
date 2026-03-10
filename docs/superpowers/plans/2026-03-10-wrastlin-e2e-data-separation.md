# Wrastlin E2e Betting Tests + Data Separation Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Split wrastlin-service data into static (developer-owned) and dynamic (runtime) dirs driven by env vars, then add Playwright API-level e2e tests for the betting system using isolated test data.

**Architecture:** `persistence.ts` gets two dir constants (`STATIC_DIR`, `DYNAMIC_DIR`) driven by env vars with defaults relative to `dist/main.js`. `gameState.ts` and `betService.ts` are updated to use the new typed accessors. The e2e package (`apps/wrastlin/wrastlin-ui-e2e`) starts a fresh wrastlin-service against temp dirs for each test run.

**Tech Stack:** Node.js/TypeScript, Fastify v5, Vitest 3 (unit), Playwright (e2e), esbuild CJS bundle, pnpm workspaces/NX

---

## Chunk 1: Data Separation — persistence.ts

### Task 1: Update persistence.ts

**Files:**
- Modify: `apps/wrastlin/meta-service/src/data/persistence.ts`
- Modify: `apps/wrastlin/meta-service/src/data/persistence.spec.ts`

The build produces `dist/main.js` (single-file bundle via esbuild). At runtime `__dirname` is `<meta-service>/dist/`. So `../data/static` resolves to `<meta-service>/data/static`.

- [ ] **Step 1: Write failing tests for new functions**

Replace the contents of `apps/wrastlin/meta-service/src/data/persistence.spec.ts`:

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

describe('persistence', () => {
  let tmpDir: string;
  let staticDir: string;
  let dynamicDir: string;

  beforeEach(() => {
    vi.resetModules(); // Reset module cache so STATIC_DIR/DYNAMIC_DIR re-evaluate from env vars
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wrastlin-persist-test-'));
    staticDir = path.join(tmpDir, 'static');
    dynamicDir = path.join(tmpDir, 'dynamic');
    fs.mkdirSync(staticDir);
    fs.mkdirSync(dynamicDir);
    process.env.STATIC_DATA_DIR = staticDir;
    process.env.DYNAMIC_DATA_DIR = dynamicDir;
  });

  afterEach(() => {
    delete process.env.STATIC_DATA_DIR;
    delete process.env.DYNAMIC_DATA_DIR;
    fs.rmSync(tmpDir, { recursive: true });
  });

  it('readStaticJson reads from STATIC_DATA_DIR', async () => {
    const { readStaticJson } = await import('./persistence.js');
    fs.writeFileSync(path.join(staticDir, 'test.json'), JSON.stringify({ x: 1 }));
    expect(readStaticJson('test.json')).toEqual({ x: 1 });
  });

  it('readDynamicJson reads from DYNAMIC_DATA_DIR', async () => {
    const { readDynamicJson } = await import('./persistence.js');
    fs.writeFileSync(path.join(dynamicDir, 'test.json'), JSON.stringify({ y: 2 }));
    expect(readDynamicJson('test.json')).toEqual({ y: 2 });
  });

  it('writeDynamicJson writes to DYNAMIC_DATA_DIR and creates subdirs', async () => {
    const { writeDynamicJson, readDynamicJson } = await import('./persistence.js');
    writeDynamicJson('bets/entries.json', [{ id: 'e1' }]);
    expect(readDynamicJson('bets/entries.json')).toEqual([{ id: 'e1' }]);
  });

  it('readJsonOrDefault returns default when dynamic file absent', async () => {
    const { readJsonOrDefault } = await import('./persistence.js');
    expect(readJsonOrDefault('missing.json', [])).toEqual([]);
  });

  it('readJsonOrDefault with dir=static returns default when static file absent', async () => {
    const { readJsonOrDefault } = await import('./persistence.js');
    expect(readJsonOrDefault('missing.json', null, 'static')).toBeNull();
  });
});
```

- [ ] **Step 2: Run tests — expect failures**

```bash
cd apps/wrastlin/meta-service && pnpm vitest run src/data/persistence.spec.ts
```

Expected: failures on `readStaticJson`, `readDynamicJson`, `writeDynamicJson` — "is not a function"

- [ ] **Step 3: Implement new persistence.ts**

Replace `apps/wrastlin/meta-service/src/data/persistence.ts`:

```typescript
import fs from 'node:fs';
import path from 'node:path';

const STATIC_DIR = process.env.STATIC_DATA_DIR
  ?? path.resolve(__dirname, '../data/static');
const DYNAMIC_DIR = process.env.DYNAMIC_DATA_DIR
  ?? path.resolve(__dirname, '../data/runtime');

export function readStaticJson<T>(filename: string): T {
  const filepath = path.join(STATIC_DIR, filename);
  return JSON.parse(fs.readFileSync(filepath, 'utf-8')) as T;
}

export function readDynamicJson<T>(filename: string): T {
  const filepath = path.join(DYNAMIC_DIR, filename);
  return JSON.parse(fs.readFileSync(filepath, 'utf-8')) as T;
}

export function writeDynamicJson<T>(filename: string, data: T): void {
  const filepath = path.join(DYNAMIC_DIR, filename);
  fs.mkdirSync(path.dirname(filepath), { recursive: true });
  fs.writeFileSync(filepath, JSON.stringify(data, null, 2), 'utf-8');
}

export function readJsonOrDefault<T>(
  filename: string,
  defaultValue: T,
  dir: 'static' | 'dynamic' = 'dynamic'
): T {
  try {
    return dir === 'static' ? readStaticJson<T>(filename) : readDynamicJson<T>(filename);
  } catch {
    return defaultValue;
  }
}
```

Note: `STATIC_DIR` and `DYNAMIC_DIR` are module-level constants, so env vars must be set before the module is first imported. In vitest the tests use dynamic `import()` inside each test after setting env vars to ensure fresh evaluation. In production the env vars are set in the shell before `node dist/main.js`.

- [ ] **Step 4: Run tests — expect pass**

```bash
cd apps/wrastlin/meta-service && pnpm vitest run src/data/persistence.spec.ts
```

Expected: all 5 tests pass

- [ ] **Step 5: Run full wrastlin-service test suite — expect failures on callers**

```bash
pnpm nx test wrastlin-service
```

Expected: compile/runtime errors in `gameState.ts` and `betService.ts` (they still import `readJson`/`writeJson` which no longer exist). That's expected — they get fixed in Task 3 and Task 4.

- [ ] **Step 6: Commit**

```bash
git add apps/wrastlin/meta-service/src/data/persistence.ts \
        apps/wrastlin/meta-service/src/data/persistence.spec.ts
git commit -m "feat(wrastlin): add static/dynamic dir separation to persistence.ts"
```

---

## Chunk 2: Data Separation — Move Files + Update .gitignore

### Task 2: Move data files and update .gitignore

**Files:**
- Create dir: `apps/wrastlin/meta-service/data/static/`
- Create dir: `apps/wrastlin/meta-service/data/runtime/bets/`
- Move: `data/wrestlers.json` → `data/static/wrestlers.json`
- Move: `data/managers.json` → `data/static/managers.json`
- Move: `data/state.json` → `data/runtime/state.json`
- Move: `data/bets/propositions.json` → `data/runtime/bets/propositions.json`
- Move: `data/bets/entries.json` → `data/runtime/bets/entries.json`
- Move: `data/submissions/.gitkeep` → `data/runtime/submissions/.gitkeep`
- Move: `data/shows/.gitkeep` → `data/runtime/shows/.gitkeep`
- Modify: `apps/wrastlin/meta-service/data/.gitignore`

No tests needed for this task — it's pure file restructuring. Run the full suite afterward to confirm nothing is broken (it will be — callers still import old functions, which is fine; they're fixed next).

- [ ] **Step 1: Create directory structure**

```bash
mkdir -p apps/wrastlin/meta-service/data/static
mkdir -p apps/wrastlin/meta-service/data/runtime/bets
mkdir -p apps/wrastlin/meta-service/data/runtime/submissions
mkdir -p apps/wrastlin/meta-service/data/runtime/shows
```

- [ ] **Step 2: Move static seed files**

```bash
mv apps/wrastlin/meta-service/data/wrestlers.json apps/wrastlin/meta-service/data/static/wrestlers.json
mv apps/wrastlin/meta-service/data/managers.json apps/wrastlin/meta-service/data/static/managers.json
```

- [ ] **Step 3: Move dynamic runtime files**

```bash
mv apps/wrastlin/meta-service/data/state.json apps/wrastlin/meta-service/data/runtime/state.json
mv apps/wrastlin/meta-service/data/bets/propositions.json apps/wrastlin/meta-service/data/runtime/bets/propositions.json
mv apps/wrastlin/meta-service/data/bets/entries.json apps/wrastlin/meta-service/data/runtime/bets/entries.json
```

Note: `submissions/` and `shows/` are already empty directories (no `.gitkeep` files exist). The `mkdir -p` in Step 1 already created their runtime equivalents. Nothing to move.

- [ ] **Step 4: Remove now-empty old dirs**

```bash
rmdir apps/wrastlin/meta-service/data/bets
rmdir apps/wrastlin/meta-service/data/submissions
rmdir apps/wrastlin/meta-service/data/shows
```

- [ ] **Step 5: Update .gitignore**

Replace `apps/wrastlin/meta-service/data/.gitignore` with:

```
runtime/
```

This gitignores the entire `runtime/` directory. `static/` is committed. (The existing `data/.gitignore` had individual entries like `submissions/*.json`, `shows/*.json` — the new single `runtime/` entry supersedes all of them. The spec's file map lists `apps/wrastlin/meta-service/.gitignore` but the intent is to scope only the `data/` directory, so keeping it at `data/.gitignore` is correct.)

- [ ] **Step 6: Verify git status looks correct**

```bash
git status apps/wrastlin/meta-service/data/
```

Expected:
- `data/static/wrestlers.json` and `data/static/managers.json` tracked as new files
- `data/runtime/` untracked (gitignored)
- Old `data/wrestlers.json`, `data/managers.json`, `data/state.json`, `data/bets/` shown as deleted

- [ ] **Step 7: Commit**

```bash
git add apps/wrastlin/meta-service/data/
git commit -m "chore(wrastlin): move data files to static/ and runtime/ dirs"
```

---

## Chunk 3: Data Separation — Update gameState.ts

### Task 3: Update gameState.ts to use new persistence functions

**Files:**
- Modify: `apps/wrastlin/meta-service/src/core/gameState.ts`

No separate spec file for `gameState.ts` exists. The callers (`showGenerator.spec.ts`, `weeklyOrchestrator.spec.ts`, `api/*.spec.ts`) already spy on these functions, so they remain valid after this change.

- [ ] **Step 1: Verify existing tests pass before touching the file**

This isn't possible right now since persistence no longer exports `readJson`/`writeJson`. But check that the import in gameState.ts is the only error:

```bash
pnpm nx test wrastlin-service 2>&1 | head -30
```

Expected: TypeScript errors importing `readJson`/`writeJson` from persistence.

- [ ] **Step 2: Replace gameState.ts**

Replace `apps/wrastlin/meta-service/src/core/gameState.ts`:

```typescript
import {
  readStaticJson,
  readDynamicJson,
  writeDynamicJson,
} from '../data/persistence.js';
import type { Wrestler, Manager, WeeklyState, WeeklySubmission } from '@org/wrastlin-shared';

export function loadWrestlers(): Wrestler[] {
  try {
    return readDynamicJson<Wrestler[]>('wrestlers.json');
  } catch {
    return readStaticJson<Wrestler[]>('wrestlers.json');
  }
}

export function saveWrestlers(wrestlers: Wrestler[]): void {
  writeDynamicJson('wrestlers.json', wrestlers);
}

export function loadManagers(): Manager[] {
  try {
    return readDynamicJson<Manager[]>('managers.json');
  } catch {
    return readStaticJson<Manager[]>('managers.json');
  }
}

export function saveManagers(managers: Manager[]): void {
  writeDynamicJson('managers.json', managers);
}

export function loadState(): WeeklyState {
  return readDynamicJson<WeeklyState>('state.json');
}

export function saveState(state: WeeklyState): void {
  writeDynamicJson('state.json', state);
}

export function loadSubmissions(week: number): WeeklySubmission[] {
  try {
    return readDynamicJson<WeeklySubmission[]>(`submissions/week-${week}.json`);
  } catch {
    return [];
  }
}

export function saveSubmissions(week: number, submissions: WeeklySubmission[]): void {
  writeDynamicJson(`submissions/week-${week}.json`, submissions);
}
```

- [ ] **Step 3: Run full test suite — expect betService.ts still fails**

```bash
pnpm nx test wrastlin-service
```

Expected: gameState-dependent tests pass, betService.ts tests still fail (it still imports `readJson`/`writeJson`).

- [ ] **Step 4: Commit**

```bash
git add apps/wrastlin/meta-service/src/core/gameState.ts
git commit -m "feat(wrastlin): update gameState.ts to use readStaticJson/readDynamicJson/writeDynamicJson"
```

---

## Chunk 4: Data Separation — Update betService.ts

### Task 4: Update betService.ts to use new persistence functions

**Files:**
- Modify: `apps/wrastlin/meta-service/src/bets/betService.ts`

- [ ] **Step 1: Replace betService.ts imports**

In `apps/wrastlin/meta-service/src/bets/betService.ts`, replace the import on line 1:

```typescript
// OLD:
import { readJson, writeJson } from '../data/persistence.js';

// NEW:
import { readDynamicJson, writeDynamicJson } from '../data/persistence.js';
```

Then update each function body:

Replace `readJson<BetProposition[]>('bets/propositions.json')` → `readDynamicJson<BetProposition[]>('bets/propositions.json')`
Replace `writeJson('bets/propositions.json', ...)` → `writeDynamicJson('bets/propositions.json', ...)`
Replace `readJson<BetEntry[]>('bets/entries.json')` → `readDynamicJson<BetEntry[]>('bets/entries.json')`
Replace `writeJson('bets/entries.json', ...)` → `writeDynamicJson('bets/entries.json', ...)`

Full updated file:

```typescript
import { readDynamicJson, writeDynamicJson } from '../data/persistence.js';
import { loadManagers, saveManagers } from '../core/gameState.js';
import type { BetProposition, BetEntry } from '@org/betting';

export function loadPropositions(): BetProposition[] {
  try {
    return readDynamicJson<BetProposition[]>('bets/propositions.json');
  } catch {
    return [];
  }
}

export function savePropositions(propositions: BetProposition[]): void {
  writeDynamicJson('bets/propositions.json', propositions);
}

export function loadEntries(): BetEntry[] {
  try {
    return readDynamicJson<BetEntry[]>('bets/entries.json');
  } catch {
    return [];
  }
}

export function saveEntries(entries: BetEntry[]): void {
  writeDynamicJson('bets/entries.json', entries);
}

/**
 * Deducts `amount` from a manager's money balance.
 * Throws if manager not found or has insufficient funds.
 *
 * Concurrency note: this is a read-then-write with no locking.
 * Acceptable for MVP single-server, low-concurrency usage.
 */
export function deductMoney(managerId: string, amount: number): void {
  const managers = loadManagers();
  const manager = managers.find(m => m.managerId === managerId);
  if (!manager) throw new Error(`Manager not found: ${managerId}`);
  if (manager.money < amount) throw new Error('Insufficient funds');
  manager.money -= amount;
  saveManagers(managers);
}

/**
 * Credits `amount` to a manager's money balance.
 * `amount` is the full parimutuel share (includes original stake).
 * Do NOT additionally refund the original stake.
 */
export function creditMoney(managerId: string, amount: number): void {
  const managers = loadManagers();
  const manager = managers.find(m => m.managerId === managerId);
  if (!manager) throw new Error(`Manager not found: ${managerId}`);
  manager.money += amount;
  saveManagers(managers);
}
```

- [ ] **Step 2: Run full test suite — expect all 43 tests pass**

```bash
pnpm nx test wrastlin-service
```

Expected: all tests pass. The existing `bets.spec.ts` mocks `betService` and `gameState` functions via `vi.spyOn`, so they don't touch the filesystem and remain valid.

- [ ] **Step 3: Commit**

```bash
git add apps/wrastlin/meta-service/src/bets/betService.ts
git commit -m "feat(wrastlin): update betService.ts to use readDynamicJson/writeDynamicJson"
```

---

## Chunk 5: E2e Infrastructure

### Task 5: Set up wrastlin-ui-e2e Playwright package

**Files:**
- Modify: `apps/wrastlin/wrastlin-ui-e2e/package.json`
- Create: `apps/wrastlin/wrastlin-ui-e2e/playwright.config.ts`
- Create: `apps/wrastlin/wrastlin-ui-e2e/tsconfig.json`
- Create: `apps/wrastlin/wrastlin-ui-e2e/src/browser/.gitkeep`

Playwright is already installed in the dungeon e2e package. Check if `@playwright/test` is available in the workspace root before adding it:

```bash
ls node_modules/@playwright/test 2>/dev/null && echo "exists" || echo "not found"
```

If it exists at the workspace root, no extra install is needed (pnpm hoisting). If not, add it to the e2e package.json.

- [ ] **Step 1: Update package.json**

Replace `apps/wrastlin/wrastlin-ui-e2e/package.json` (following the pattern of `apps/dungeon/dungeon-ui-e2e/package.json` which declares NX config in the `nx` field — no separate `project.json`):

```json
{
  "name": "@org/wrastlin-ui-e2e",
  "version": "0.0.1",
  "private": true,
  "devDependencies": {
    "@playwright/test": "*"
  },
  "nx": {
    "implicitDependencies": ["wrastlin-service"],
    "targets": {
      "e2e": {
        "executor": "nx:run-commands",
        "options": {
          "command": "pnpm playwright test",
          "cwd": "apps/wrastlin/wrastlin-ui-e2e"
        }
      }
    }
  }
}
```

Using `"*"` picks up the workspace-hoisted version. Run `pnpm install` from the repo root after editing this file (in a real terminal — pnpm can hang in non-TTY Claude Code background tasks):

```bash
# Run this in your terminal (not via Claude), then confirm it completed:
pnpm install
```

- [ ] **Step 2: Create tsconfig.json**

Create `apps/wrastlin/wrastlin-ui-e2e/tsconfig.json`:

```json
{
  "extends": "../../../tsconfig.base.json",
  "compilerOptions": {
    "allowJs": true,
    "outDir": "out-tsc/playwright",
    "sourceMap": false
  },
  "include": [
    "**/*.ts",
    "**/*.js",
    "playwright.config.ts",
    "src/**/*.spec.ts",
    "src/**/*.spec.js",
    "src/**/*.test.ts",
    "src/**/*.test.js",
    "src/**/*.d.ts"
  ],
  "exclude": ["out-tsc", "test-output"]
}
```

- [ ] **Step 3: Create playwright.config.ts**

Create `apps/wrastlin/wrastlin-ui-e2e/playwright.config.ts`:

```typescript
import { defineConfig } from '@playwright/test';
import path from 'node:path';

export default defineConfig({
  testDir: './src',
  workers: 1,
  globalSetup: './src/global-setup.ts',
  globalTeardown: './src/global-teardown.ts',
  use: {
    baseURL: 'http://localhost:3002',
  },
  webServer: {
    command: 'node scripts/build.js && node dist/main.js',
    cwd: path.resolve(__dirname, '../../meta-service'),
    url: 'http://localhost:3002/health',
    reuseExistingServer: false,
    env: {
      STATIC_DATA_DIR: '/tmp/wrastlin-e2e/static',
      DYNAMIC_DATA_DIR: '/tmp/wrastlin-e2e/runtime',
    },
  },
  projects: [
    {
      name: 'api',
      testMatch: ['**/*.api.spec.ts'],
      use: { baseURL: 'http://localhost:3002' },
    },
    {
      name: 'chromium',
      testMatch: ['**/browser/**/*.spec.ts'],
      use: { browserName: 'chromium' },
    },
  ],
});
```

- [ ] **Step 4: Create browser placeholder**

```bash
mkdir -p apps/wrastlin/wrastlin-ui-e2e/src/browser
touch apps/wrastlin/wrastlin-ui-e2e/src/browser/.gitkeep
```

- [ ] **Step 5: Commit**

```bash
git add apps/wrastlin/wrastlin-ui-e2e/
git commit -m "chore(wrastlin-e2e): set up Playwright package infrastructure"
```

---

## Chunk 6: E2e Test Data Setup

### Task 6: Write global-setup.ts and global-teardown.ts

**Files:**
- Create: `apps/wrastlin/wrastlin-ui-e2e/src/global-setup.ts`
- Create: `apps/wrastlin/wrastlin-ui-e2e/src/global-teardown.ts`

These run once before/after the entire Playwright test suite.

`global-setup.ts` location: `apps/wrastlin/wrastlin-ui-e2e/src/global-setup.ts`
`__dirname` in this file: `apps/wrastlin/wrastlin-ui-e2e/src/`

Fixture source (absolute): `path.resolve(__dirname, '../../meta-service/data/static/wrestlers.json')`
That resolves: `src/ → wrastlin-ui-e2e/ → wrastlin/` then `meta-service/data/static/wrestlers.json` = `apps/wrastlin/meta-service/data/static/wrestlers.json` ✓

- [ ] **Step 1: Create global-setup.ts**

Create `apps/wrastlin/wrastlin-ui-e2e/src/global-setup.ts`:

```typescript
import fs from 'node:fs';
import path from 'node:path';

const STATIC_DIR = '/tmp/wrastlin-e2e/static';
const DYNAMIC_DIR = '/tmp/wrastlin-e2e/runtime';

const FIXTURE_STATIC = path.resolve(__dirname, '../../meta-service/data/static');

const CLEAN_STATE = {
  currentWeek: 1,
  phase: 'week_open',
  updatedAt: new Date().toISOString(),
};

export default async function globalSetup() {
  // Clean up any leftover from a previous run
  if (fs.existsSync('/tmp/wrastlin-e2e')) {
    fs.rmSync('/tmp/wrastlin-e2e', { recursive: true });
  }

  // Create temp dirs
  fs.mkdirSync(STATIC_DIR, { recursive: true });
  fs.mkdirSync(path.join(DYNAMIC_DIR, 'bets'), { recursive: true });

  // Copy static seed files
  fs.copyFileSync(
    path.join(FIXTURE_STATIC, 'wrestlers.json'),
    path.join(STATIC_DIR, 'wrestlers.json')
  );
  fs.copyFileSync(
    path.join(FIXTURE_STATIC, 'managers.json'),
    path.join(STATIC_DIR, 'managers.json')
  );

  // Write clean runtime state
  fs.writeFileSync(
    path.join(DYNAMIC_DIR, 'state.json'),
    JSON.stringify(CLEAN_STATE, null, 2)
  );
  fs.writeFileSync(
    path.join(DYNAMIC_DIR, 'bets', 'propositions.json'),
    JSON.stringify([], null, 2)
  );
  fs.writeFileSync(
    path.join(DYNAMIC_DIR, 'bets', 'entries.json'),
    JSON.stringify([], null, 2)
  );
}
```

- [ ] **Step 2: Create global-teardown.ts**

Create `apps/wrastlin/wrastlin-ui-e2e/src/global-teardown.ts`:

```typescript
import fs from 'node:fs';

export default async function globalTeardown() {
  if (fs.existsSync('/tmp/wrastlin-e2e')) {
    fs.rmSync('/tmp/wrastlin-e2e', { recursive: true });
  }
}
```

- [ ] **Step 3: Commit**

```bash
git add apps/wrastlin/wrastlin-ui-e2e/src/global-setup.ts \
        apps/wrastlin/wrastlin-ui-e2e/src/global-teardown.ts
git commit -m "feat(wrastlin-e2e): add global-setup and global-teardown for test data isolation"
```

---

## Chunk 7: Betting API E2e Tests

### Task 7: Write betting.api.spec.ts

**Files:**
- Create: `apps/wrastlin/wrastlin-ui-e2e/src/betting.api.spec.ts`

All tests use Playwright's `request` fixture — HTTP only, no browser. The server is started once per full test run (single webServer process). Each `describe` block has a `beforeEach` that resets runtime files to a clean state.

The `beforeEach` reset writes directly to `/tmp/wrastlin-e2e/runtime/` — this works because:
1. The server reads fresh from disk on each request (no in-memory cache)
2. `workers: 1` ensures no parallel requests race with the file reset

Manager seed data: `{ managerId: 'm-001', wrestlerId: 'w-002', money: 1000, trustLevel: 'medium' }`
Wrestler seed data includes `w-001` (Rex Dominion), `w-002` (Steel Purity)

- [ ] **Step 1: Create betting.api.spec.ts**

Create `apps/wrastlin/wrastlin-ui-e2e/src/betting.api.spec.ts`:

```typescript
import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

const DYNAMIC_DIR = '/tmp/wrastlin-e2e/runtime';

const CLEAN_STATE = {
  currentWeek: 1,
  phase: 'week_open',
  updatedAt: new Date().toISOString(),
};

function resetRuntime() {
  fs.writeFileSync(
    path.join(DYNAMIC_DIR, 'state.json'),
    JSON.stringify(CLEAN_STATE, null, 2)
  );
  fs.writeFileSync(
    path.join(DYNAMIC_DIR, 'bets', 'propositions.json'),
    JSON.stringify([], null, 2)
  );
  fs.writeFileSync(
    path.join(DYNAMIC_DIR, 'bets', 'entries.json'),
    JSON.stringify([], null, 2)
  );
  // Remove dynamic managers.json so it reloads from static seed
  const dynManagers = path.join(DYNAMIC_DIR, 'managers.json');
  if (fs.existsSync(dynManagers)) fs.unlinkSync(dynManagers);
}

const VALID_PROPOSITION = {
  createdBy: 'm-001',
  question: 'Who will win this match?',
  options: [
    { optionId: 'opt-rex', label: 'Rex Dominion' },
    { optionId: 'opt-steel', label: 'Steel Purity' },
  ],
  closesAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(), // 1 hour from now
  eventKey: 1,
};

// ─── Proposition creation ──────────────────────────────────────────────────────

test.describe('POST /bets/propositions', () => {
  test.beforeEach(() => resetRuntime());

  test('creates a proposition and returns 201 with status open', async ({ request }) => {
    const res = await request.post('/bets/propositions', { data: VALID_PROPOSITION });
    expect(res.status()).toBe(201);
    const body = await res.json();
    expect(body.status).toBe('open');
    expect(typeof body.propositionId).toBe('string');
    expect(body.createdBy).toBe('m-001');
    expect(body.options).toHaveLength(2);
  });

  test('returns 400 when phase is submissions_closed', async ({ request }) => {
    // Close submissions first
    await request.post('/state/close-submissions');

    const res = await request.post('/bets/propositions', { data: VALID_PROPOSITION });
    expect(res.status()).toBe(400);
    const body = await res.json();
    expect(body.error).toContain('week_open');
  });

  test('returns 404 when createdBy manager does not exist', async ({ request }) => {
    const res = await request.post('/bets/propositions', {
      data: { ...VALID_PROPOSITION, createdBy: 'nonexistent' },
    });
    expect(res.status()).toBe(404);
  });
});

// ─── Placing bets ─────────────────────────────────────────────────────────────

test.describe('POST /bets/propositions/:id/entries', () => {
  test.beforeEach(() => resetRuntime());

  test('places a bet and returns 201, money is reduced', async ({ request }) => {
    // Create proposition
    const propRes = await request.post('/bets/propositions', { data: VALID_PROPOSITION });
    const { propositionId } = await propRes.json();

    // Place bet
    const entryRes = await request.post(`/bets/propositions/${propositionId}/entries`, {
      data: { bettorId: 'm-001', optionId: 'opt-rex', amount: 100 },
    });
    expect(entryRes.status()).toBe(201);
    const entry = await entryRes.json();
    expect(entry.bettorId).toBe('m-001');
    expect(entry.amount).toBe(100);
    expect(typeof entry.entryId).toBe('string');

    // Verify money was deducted
    const mgr = await request.get('/managers/m-001');
    expect(mgr.status()).toBe(200);
    const mgrBody = await mgr.json();
    expect(mgrBody.money).toBe(900);
  });

  test('returns 400 when amount exceeds manager balance', async ({ request }) => {
    const propRes = await request.post('/bets/propositions', { data: VALID_PROPOSITION });
    const { propositionId } = await propRes.json();

    const res = await request.post(`/bets/propositions/${propositionId}/entries`, {
      data: { bettorId: 'm-001', optionId: 'opt-rex', amount: 9999 },
    });
    expect(res.status()).toBe(400);
    const body = await res.json();
    expect(body.error).toContain('Insufficient funds');
  });

  test('returns 404 when proposition does not exist', async ({ request }) => {
    const res = await request.post('/bets/propositions/nonexistent/entries', {
      data: { bettorId: 'm-001', optionId: 'opt-rex', amount: 10 },
    });
    expect(res.status()).toBe(404);
  });
});

// ─── View entries ─────────────────────────────────────────────────────────────

test.describe('GET /bets/entries', () => {
  test.beforeEach(() => resetRuntime());

  test('returns entries filtered by bettorId', async ({ request }) => {
    const propRes = await request.post('/bets/propositions', { data: VALID_PROPOSITION });
    const { propositionId } = await propRes.json();
    await request.post(`/bets/propositions/${propositionId}/entries`, {
      data: { bettorId: 'm-001', optionId: 'opt-rex', amount: 50 },
    });

    const res = await request.get('/bets/entries?bettorId=m-001');
    expect(res.status()).toBe(200);
    const entries = await res.json();
    expect(Array.isArray(entries)).toBe(true);
    expect(entries).toHaveLength(1);
    expect(entries[0].bettorId).toBe('m-001');
    expect(entries[0].amount).toBe(50);
  });
});

// ─── Full happy path ──────────────────────────────────────────────────────────

test.describe('Full betting lifecycle', () => {
  test.beforeEach(() => resetRuntime());

  test('create → bet → pool check → resolve → payout credited', async ({ request }) => {
    // 1. Create proposition
    const propRes = await request.post('/bets/propositions', { data: VALID_PROPOSITION });
    expect(propRes.status()).toBe(201);
    const { propositionId } = await propRes.json();

    // 2. Place bet (m-001 bets 100 on Rex)
    const entryRes = await request.post(`/bets/propositions/${propositionId}/entries`, {
      data: { bettorId: 'm-001', optionId: 'opt-rex', amount: 100 },
    });
    expect(entryRes.status()).toBe(201);

    // 3. Check pool
    const poolRes = await request.get(`/bets/propositions/${propositionId}`);
    expect(poolRes.status()).toBe(200);
    const poolBody = await poolRes.json();
    expect(poolBody.pool.totalPot).toBe(100);
    expect(poolBody.pool.byOption['opt-rex']).toBe(100);

    // 4. Resolve proposition (Rex wins)
    const resolveRes = await request.post(`/bets/propositions/${propositionId}/resolve`, {
      data: { winningOptionIds: ['opt-rex'] },
    });
    expect(resolveRes.status()).toBe(200);
    const resolveBody = await resolveRes.json();
    expect(resolveBody.proposition.status).toBe('resolved');
    expect(resolveBody.payouts).toHaveLength(1);
    expect(resolveBody.payouts[0].amount).toBe(100);

    // 5. Verify money restored (m-001 is sole bettor → receives 100% of pot)
    const mgrRes = await request.get('/managers/m-001');
    const mgrBody = await mgrRes.json();
    expect(mgrBody.money).toBe(1000); // 1000 - 100 + 100 = 1000
  });
});

// ─── Phase enforcement ────────────────────────────────────────────────────────

test.describe('Phase enforcement', () => {
  test.beforeEach(() => resetRuntime());

  test('bet is rejected when phase transitions to submissions_closed', async ({ request }) => {
    // 1. Create proposition while week_open
    const propRes = await request.post('/bets/propositions', { data: VALID_PROPOSITION });
    const { propositionId } = await propRes.json();

    // 2. Place first bet successfully
    const firstBet = await request.post(`/bets/propositions/${propositionId}/entries`, {
      data: { bettorId: 'm-001', optionId: 'opt-rex', amount: 10 },
    });
    expect(firstBet.status()).toBe(201);

    // 3. Close submissions
    const closeRes = await request.post('/state/close-submissions');
    expect(closeRes.status()).toBe(200);
    const state = await closeRes.json();
    expect(state.phase).toBe('submissions_closed');

    // 4. Attempt another bet — should be rejected
    const secondBet = await request.post(`/bets/propositions/${propositionId}/entries`, {
      data: { bettorId: 'm-001', optionId: 'opt-steel', amount: 10 },
    });
    expect(secondBet.status()).toBe(400);
    const body = await secondBet.json();
    expect(body.error).toContain('not accepting bets');
  });
});

// ─── Guard: resolve already-resolved proposition ──────────────────────────────

test.describe('Resolve guards', () => {
  test.beforeEach(() => resetRuntime());

  test('returns 400 when resolving an already-resolved proposition', async ({ request }) => {
    const propRes = await request.post('/bets/propositions', { data: VALID_PROPOSITION });
    const { propositionId } = await propRes.json();

    // Resolve once
    await request.post(`/bets/propositions/${propositionId}/resolve`, {
      data: { winningOptionIds: ['opt-rex'] },
    });

    // Resolve again
    const secondResolve = await request.post(`/bets/propositions/${propositionId}/resolve`, {
      data: { winningOptionIds: ['opt-rex'] },
    });
    expect(secondResolve.status()).toBe(400);
    const body = await secondResolve.json();
    expect(body.error).toContain('already resolved');
  });
});
```

- [ ] **Step 2: Verify playwright config references correct test pattern**

The spec file matches `**/*.api.spec.ts`. The `api` project in `playwright.config.ts` uses `testMatch: ['**/*.api.spec.ts']`. Confirm the file is named `betting.api.spec.ts` — it is.

- [ ] **Step 3: Run e2e tests**

Build wrastlin-service first, then run e2e:

```bash
# First build (Playwright will also build via webServer, but this confirms no TS errors)
pnpm nx build wrastlin-service

# Run e2e suite
pnpm nx e2e wrastlin-ui-e2e
```

If Playwright complains about missing browser binaries:
```bash
cd apps/wrastlin/wrastlin-ui-e2e && pnpm playwright install chromium
```

Expected: all API tests pass (browser/chromium project has no matching tests so it will be empty).

- [ ] **Step 4: Commit**

```bash
git add apps/wrastlin/wrastlin-ui-e2e/src/betting.api.spec.ts
git commit -m "feat(wrastlin-e2e): add Playwright API e2e tests for betting system"
```

---

## Final Verification

After all tasks complete:

- [ ] Run full wrastlin-service unit test suite: `pnpm nx test wrastlin-service` — all 43 tests pass
- [ ] Run e2e suite: `pnpm nx e2e wrastlin-ui-e2e` — all API tests pass
- [ ] Confirm `data/runtime/` is gitignored: `git status apps/wrastlin/meta-service/data/` — only `data/static/` files appear as tracked
- [ ] Confirm `data/static/wrestlers.json` and `data/static/managers.json` are committed
