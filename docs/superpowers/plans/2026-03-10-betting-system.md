# Betting System Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a cross-game parimutuel betting system as a shared pure-logic lib (`@org/betting`) consumed by the wrastlin game server for manager-created proposition bets.

**Architecture:** Shared pure-logic lib in `libs/shared/betting` (types, pool math, payout strategies, validation). Wrastlin game server owns HTTP routes, JSON file persistence, and money deduction/crediting. Phase enforcement is done by checking the live game state — no stored deadline on the proposition.

**Tech Stack:** TypeScript, Vitest 3, Fastify 5, esbuild (CJS bundle), NX 22, pnpm workspaces.

**Spec:** `docs/superpowers/specs/2026-03-10-betting-system-design.md`

---

## Chunk 1: Workspace scaffolding + shared lib scaffold

### Task 1: Update workspace config

**Files:**
- Modify: `pnpm-workspace.yaml`
- Modify: `tsconfig.base.json`
- Modify: `tsconfig.json`

- [ ] **Step 1: Add `libs/shared/*` to pnpm-workspace.yaml**

Open `pnpm-workspace.yaml` and add the glob so pnpm discovers the new lib:

```yaml
packages:
  - 'apps/*'
  - 'apps/dungeon/*'
  - 'apps/wrastlin/*'
  - 'libs/dungeon/*'
  - 'libs/wrastlin/*'
  - 'libs/shared/*'
```

- [ ] **Step 2: Add `@org/betting` path alias to tsconfig.base.json**

In `tsconfig.base.json`, add one entry to the `paths` object:

```json
"@org/betting": ["./libs/shared/betting/src/index.ts"]
```

The full `paths` block becomes:

```json
"paths": {
  "@org/shared": ["./libs/dungeon/shared/src/index.ts"],
  "@org/items": ["./libs/dungeon/items/src/index.ts"],
  "@org/wrastlin-shared": ["./libs/wrastlin/shared/src/index.ts"],
  "@org/betting": ["./libs/shared/betting/src/index.ts"]
}
```

- [ ] **Step 3: Add reference to root tsconfig.json**

In `tsconfig.json`, add to the `references` array:

```json
{ "path": "./libs/shared/betting" }
```

- [ ] **Step 4: Run `pnpm install` in a real terminal** (not this session — pnpm hangs in non-TTY environments)

```
pnpm install
```

Expected: resolves workspace packages, no errors.

- [ ] **Step 5: Commit**

```bash
git add pnpm-workspace.yaml tsconfig.base.json tsconfig.json
git commit -m "chore: add libs/shared/* workspace glob and @org/betting tsconfig alias"
```

---

### Task 2: Scaffold the betting lib

**Files:**
- Create: `libs/shared/betting/package.json`
- Create: `libs/shared/betting/tsconfig.json`
- Create: `libs/shared/betting/tsconfig.lib.json`
- Create: `libs/shared/betting/project.json`
- Create: `libs/shared/betting/vitest.config.mts`

- [ ] **Step 1: Create `libs/shared/betting/package.json`**

```json
{
  "name": "@org/betting",
  "version": "0.0.0",
  "private": true
}
```

- [ ] **Step 2: Create `libs/shared/betting/tsconfig.json`**

Matches the pattern in `libs/wrastlin/shared/tsconfig.json`:

```json
{
  "extends": "../../../tsconfig.base.json",
  "files": [],
  "include": [],
  "references": [{ "path": "./tsconfig.lib.json" }]
}
```

- [ ] **Step 3: Create `libs/shared/betting/tsconfig.lib.json`**

Matches `libs/wrastlin/shared/tsconfig.lib.json` pattern:

```json
{
  "extends": "../../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "../../../dist/libs/shared/betting",
    "rootDir": "src",
    "types": ["node"],
    "tsBuildInfoFile": "../../../dist/libs/shared/betting/tsconfig.lib.tsbuildinfo"
  },
  "include": ["src/**/*.ts"]
}
```

- [ ] **Step 4: Create `libs/shared/betting/project.json`**

Gives NX a test target for `pnpm nx test betting`:

```json
{
  "name": "betting",
  "$schema": "../../../node_modules/nx/schemas/project-schema.json",
  "projectType": "library",
  "sourceRoot": "libs/shared/betting/src",
  "targets": {
    "test": {
      "executor": "nx:run-commands",
      "options": {
        "command": "pnpm vitest run",
        "cwd": "libs/shared/betting"
      }
    }
  }
}
```

- [ ] **Step 5: Create `libs/shared/betting/vitest.config.mts`**

```typescript
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: false,
    environment: 'node',
    include: ['src/**/*.spec.ts'],
  },
});
```

- [ ] **Step 6: Commit**

```bash
git add libs/shared/betting/
git commit -m "chore: scaffold @org/betting shared lib"
```

---

### Task 3: Define betting types

**Files:**
- Create: `libs/shared/betting/src/types.ts`

No tests needed — types are compile-time only.

- [ ] **Step 1: Create `libs/shared/betting/src/types.ts`**

```typescript
export type PropositionStatus = 'open' | 'closed' | 'resolved';

export interface BetOption {
  optionId: string;
  label: string;
}

export interface BetProposition {
  propositionId: string;
  createdBy: string;
  question: string;
  options: BetOption[];
  status: PropositionStatus;
  closesAt: string;         // ISO — hard per-proposition deadline
  eventKey: string | number; // week number or game-specific event identifier
  createdAt: string;
  resolvedAt?: string;
  winningOptionIds?: string[];
}

export interface BetEntry {
  entryId: string;
  propositionId: string;
  bettorId: string;
  optionId: string;
  amount: number;
  placedAt: string;
}

export interface BetPool {
  totalPot: number;
  byOption: Record<string, number>; // optionId → total wagered on that option
}

/**
 * amount = total to credit the winner (includes their original stake).
 * Do NOT additionally refund the stake — the full parimutuel share is here.
 */
export interface BetPayout {
  bettorId: string;
  entryId: string;
  amount: number;
}

export interface PayoutStrategy {
  calculate(pool: BetPool, entries: BetEntry[], winningOptionIds: string[]): BetPayout[];
}
```

- [ ] **Step 2: Commit**

```bash
git add libs/shared/betting/src/types.ts
git commit -m "feat(betting): add core types"
```

---

## Chunk 2: Shared lib pure logic

### Task 4: buildPool

**Files:**
- Create: `libs/shared/betting/src/pool.ts`
- Create: `libs/shared/betting/src/pool.spec.ts`

- [ ] **Step 1: Write the failing tests**

Create `libs/shared/betting/src/pool.spec.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { buildPool } from './pool.js';
import type { BetEntry } from './types.js';

const entry = (optionId: string, amount: number, entryId = 'e-' + optionId): BetEntry => ({
  entryId,
  propositionId: 'p-001',
  bettorId: 'm-001',
  optionId,
  amount,
  placedAt: '2026-01-01T00:00:00Z',
});

describe('buildPool', () => {
  it('returns empty pool when given no entries', () => {
    const pool = buildPool([]);
    expect(pool.totalPot).toBe(0);
    expect(pool.byOption).toEqual({});
  });

  it('totals a single entry', () => {
    const pool = buildPool([entry('opt-a', 100)]);
    expect(pool.totalPot).toBe(100);
    expect(pool.byOption['opt-a']).toBe(100);
  });

  it('sums multiple entries across multiple options', () => {
    const pool = buildPool([
      entry('opt-a', 100, 'e-1'),
      entry('opt-b', 200, 'e-2'),
      entry('opt-a', 50, 'e-3'),
    ]);
    expect(pool.totalPot).toBe(350);
    expect(pool.byOption['opt-a']).toBe(150);
    expect(pool.byOption['opt-b']).toBe(200);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
pnpm nx test betting
```

Expected: FAIL — `buildPool` is not defined.

- [ ] **Step 3: Implement `buildPool`**

Create `libs/shared/betting/src/pool.ts`:

```typescript
import type { BetEntry, BetPool } from './types.js';

export function buildPool(entries: BetEntry[]): BetPool {
  const byOption: Record<string, number> = {};
  let totalPot = 0;
  for (const entry of entries) {
    byOption[entry.optionId] = (byOption[entry.optionId] ?? 0) + entry.amount;
    totalPot += entry.amount;
  }
  return { totalPot, byOption };
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
pnpm nx test betting
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add libs/shared/betting/src/pool.ts libs/shared/betting/src/pool.spec.ts
git commit -m "feat(betting): add buildPool"
```

---

### Task 5: isPropositionAcceptingBets

**Files:**
- Create: `libs/shared/betting/src/validation.ts`
- Create: `libs/shared/betting/src/validation.spec.ts`

- [ ] **Step 1: Write the failing tests**

Create `libs/shared/betting/src/validation.spec.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { isPropositionAcceptingBets } from './validation.js';
import type { BetProposition } from './types.js';

const future = '2099-01-01T00:00:00Z';
const past   = '2000-01-01T00:00:00Z';
const now    = '2026-03-10T12:00:00Z';

const open = (overrides: Partial<BetProposition> = {}): BetProposition => ({
  propositionId: 'p-001',
  createdBy: 'm-001',
  question: 'Who wins?',
  options: [],
  status: 'open',
  closesAt: future,
  eventKey: 1,
  createdAt: '2026-03-10T00:00:00Z',
  ...overrides,
});

describe('isPropositionAcceptingBets', () => {
  it('returns true when status is open, deadline is future, phase is week_open', () => {
    expect(isPropositionAcceptingBets(open(), now, 'week_open')).toBe(true);
  });

  it('returns false when status is closed', () => {
    expect(isPropositionAcceptingBets(open({ status: 'closed' }), now, 'week_open')).toBe(false);
  });

  it('returns false when status is resolved', () => {
    expect(isPropositionAcceptingBets(open({ status: 'resolved' }), now, 'week_open')).toBe(false);
  });

  it('returns false when closesAt is in the past', () => {
    expect(isPropositionAcceptingBets(open({ closesAt: past }), now, 'week_open')).toBe(false);
  });

  it('returns false when game phase is submissions_closed', () => {
    expect(isPropositionAcceptingBets(open(), now, 'submissions_closed')).toBe(false);
  });

  it('returns false when game phase is show_generated', () => {
    expect(isPropositionAcceptingBets(open(), now, 'show_generated')).toBe(false);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
pnpm nx test betting
```

Expected: FAIL — `isPropositionAcceptingBets` is not defined.

- [ ] **Step 3: Implement `isPropositionAcceptingBets`**

Create `libs/shared/betting/src/validation.ts`:

```typescript
import type { BetProposition } from './types.js';

export function isPropositionAcceptingBets(
  proposition: BetProposition,
  now: string,
  gamePhase: string
): boolean {
  if (proposition.status !== 'open') return false;
  if (now >= proposition.closesAt) return false;
  if (gamePhase !== 'week_open') return false;
  return true;
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
pnpm nx test betting
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add libs/shared/betting/src/validation.ts libs/shared/betting/src/validation.spec.ts
git commit -m "feat(betting): add isPropositionAcceptingBets"
```

---

### Task 6: parimutuelStrategy and calculatePayouts

**Files:**
- Create: `libs/shared/betting/src/payouts.ts`
- Create: `libs/shared/betting/src/payouts.spec.ts`

- [ ] **Step 1: Write the failing tests**

Create `libs/shared/betting/src/payouts.spec.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { calculatePayouts, parimutuelStrategy } from './payouts.js';
import type { BetEntry, BetPool, PayoutStrategy } from './types.js';

const entry = (
  entryId: string,
  bettorId: string,
  optionId: string,
  amount: number
): BetEntry => ({
  entryId,
  propositionId: 'p-001',
  bettorId,
  optionId,
  amount,
  placedAt: '2026-01-01T00:00:00Z',
});

describe('calculatePayouts (parimutuel default)', () => {
  it('awards the full pot to the single winner', () => {
    const entries: BetEntry[] = [
      entry('e-1', 'm-1', 'opt-a', 100),
      entry('e-2', 'm-2', 'opt-b', 200),
    ];
    const pool: BetPool = { totalPot: 300, byOption: { 'opt-a': 100, 'opt-b': 200 } };

    const payouts = calculatePayouts(pool, entries, ['opt-a']);

    expect(payouts).toHaveLength(1);
    expect(payouts[0].bettorId).toBe('m-1');
    expect(payouts[0].entryId).toBe('e-1');
    expect(payouts[0].amount).toBe(300); // full pot goes to the only winner
  });

  it('splits the pot proportionally among multiple winners on the same option', () => {
    // Two bettors both picked opt-a (100 and 100), nobody picked opt-b (200)
    const entries: BetEntry[] = [
      entry('e-1', 'm-1', 'opt-a', 100),
      entry('e-2', 'm-2', 'opt-a', 100),
      entry('e-3', 'm-3', 'opt-b', 200),
    ];
    const pool: BetPool = { totalPot: 400, byOption: { 'opt-a': 200, 'opt-b': 200 } };

    const payouts = calculatePayouts(pool, entries, ['opt-a']);

    expect(payouts).toHaveLength(2);
    // Each winner staked 100 out of 200 total on opt-a → 50% × 400 = 200 each
    const sorted = payouts.sort((a, b) => a.bettorId.localeCompare(b.bettorId));
    expect(sorted[0].amount).toBe(200);
    expect(sorted[1].amount).toBe(200);
  });

  it('splits the pot proportionally when multiple options are all declared winners', () => {
    // opt-a bettor staked 100, opt-b bettor staked 300 — both win
    const entries: BetEntry[] = [
      entry('e-1', 'm-1', 'opt-a', 100),
      entry('e-2', 'm-2', 'opt-b', 300),
    ];
    const pool: BetPool = { totalPot: 400, byOption: { 'opt-a': 100, 'opt-b': 300 } };

    const payouts = calculatePayouts(pool, entries, ['opt-a', 'opt-b']);

    expect(payouts).toHaveLength(2);
    const byBettor = Object.fromEntries(payouts.map(p => [p.bettorId, p.amount]));
    // m-1: 100/400 × 400 = 100; m-2: 300/400 × 400 = 300
    expect(byBettor['m-1']).toBe(100);
    expect(byBettor['m-2']).toBe(300);
  });

  it('returns empty array when no entries match winning options', () => {
    const entries: BetEntry[] = [entry('e-1', 'm-1', 'opt-b', 100)];
    const pool: BetPool = { totalPot: 100, byOption: { 'opt-b': 100 } };

    const payouts = calculatePayouts(pool, entries, ['opt-a']);

    expect(payouts).toHaveLength(0);
  });

  it('uses a custom strategy when provided', () => {
    const flatStrategy: PayoutStrategy = {
      calculate: (_pool, entries, winningOptionIds) =>
        entries
          .filter(e => winningOptionIds.includes(e.optionId))
          .map(e => ({ bettorId: e.bettorId, entryId: e.entryId, amount: e.amount * 2 })),
    };

    const entries: BetEntry[] = [entry('e-1', 'm-1', 'opt-a', 50)];
    const pool: BetPool = { totalPot: 50, byOption: { 'opt-a': 50 } };

    const payouts = calculatePayouts(pool, entries, ['opt-a'], flatStrategy);

    expect(payouts[0].amount).toBe(100); // doubled by custom strategy
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
pnpm nx test betting
```

Expected: FAIL — `calculatePayouts` is not defined.

- [ ] **Step 3: Implement `parimutuelStrategy` and `calculatePayouts`**

Create `libs/shared/betting/src/payouts.ts`:

```typescript
import type { BetEntry, BetPool, BetPayout, PayoutStrategy } from './types.js';

export const parimutuelStrategy: PayoutStrategy = {
  calculate(pool: BetPool, entries: BetEntry[], winningOptionIds: string[]): BetPayout[] {
    const totalStakedOnWinners = winningOptionIds.reduce(
      (sum, id) => sum + (pool.byOption[id] ?? 0),
      0
    );
    if (totalStakedOnWinners === 0) return [];

    return entries
      .filter(e => winningOptionIds.includes(e.optionId))
      .map(e => ({
        bettorId: e.bettorId,
        entryId: e.entryId,
        amount: (e.amount / totalStakedOnWinners) * pool.totalPot,
      }));
  },
};

export function calculatePayouts(
  pool: BetPool,
  entries: BetEntry[],
  winningOptionIds: string[],
  strategy: PayoutStrategy = parimutuelStrategy
): BetPayout[] {
  return strategy.calculate(pool, entries, winningOptionIds);
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
pnpm nx test betting
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add libs/shared/betting/src/payouts.ts libs/shared/betting/src/payouts.spec.ts
git commit -m "feat(betting): add parimutuelStrategy and calculatePayouts"
```

---

### Task 7: Export the shared lib

**Files:**
- Create: `libs/shared/betting/src/index.ts`

- [ ] **Step 1: Create `libs/shared/betting/src/index.ts`**

```typescript
export * from './types.js';
export * from './pool.js';
export * from './validation.js';
export * from './payouts.js';
```

- [ ] **Step 2: Run all betting tests one more time**

```bash
pnpm nx test betting
```

Expected: PASS — all tests still green.

- [ ] **Step 3: Commit**

```bash
git add libs/shared/betting/src/index.ts
git commit -m "feat(betting): export shared lib index"
```

---

## Chunk 3: wrastlin-service integration

### Task 8: Update wrastlin-service build and test configs

**Files:**
- Modify: `apps/wrastlin/meta-service/scripts/build.js`
- Modify: `apps/wrastlin/meta-service/vitest.config.mts`

- [ ] **Step 1: Add `@org/betting` alias to `scripts/build.js`**

Both `buildSync` calls need the alias. Open `apps/wrastlin/meta-service/scripts/build.js` and add to each `alias` block:

```js
'@org/betting': path.resolve(root, '../../../libs/shared/betting/src/index.ts'),
```

The first `buildSync` call's `alias` becomes:

```js
alias: {
  '@org/wrastlin-shared': path.resolve(root, '../../../libs/wrastlin/shared/src/index.ts'),
  '@org/betting': path.resolve(root, '../../../libs/shared/betting/src/index.ts'),
},
```

Apply the same change to the second `buildSync` call.

- [ ] **Step 2: Add `@org/betting` alias to `vitest.config.mts`**

Open `apps/wrastlin/meta-service/vitest.config.mts` and add to `resolve.alias`:

```typescript
'@org/betting': path.resolve(root, '../../../libs/shared/betting/src/index.ts'),
```

The full `alias` block becomes:

```typescript
alias: {
  '@org/wrastlin-shared': path.resolve(root, '../../../libs/wrastlin/shared/src/index.ts'),
  '@org/betting': path.resolve(root, '../../../libs/shared/betting/src/index.ts'),
},
```

- [ ] **Step 3: Verify existing tests still pass**

```bash
pnpm nx test wrastlin-service
```

Expected: all 27 tests PASS (config change only, no logic changed).

- [ ] **Step 4: Commit**

```bash
git add apps/wrastlin/meta-service/scripts/build.js apps/wrastlin/meta-service/vitest.config.mts
git commit -m "chore(wrastlin-service): add @org/betting alias to build and vitest configs"
```

---

### Task 9: Create initial data files

**Files:**
- Create: `apps/wrastlin/meta-service/data/bets/propositions.json`
- Create: `apps/wrastlin/meta-service/data/bets/entries.json`

- [ ] **Step 1: Create `data/bets/propositions.json`**

```json
[]
```

- [ ] **Step 2: Create `data/bets/entries.json`**

```json
[]
```

- [ ] **Step 3: Commit**

```bash
git add apps/wrastlin/meta-service/data/bets/
git commit -m "chore(wrastlin-service): add empty bet data files"
```

---

### Task 10: Bet persistence service

**Files:**
- Create: `apps/wrastlin/meta-service/src/bets/betService.ts`

The persistence functions are thin wrappers around `readJson`/`writeJson`. The money helpers read and write `managers.json`. They are tested via the route integration tests in Task 11.

- [ ] **Step 1: Create `apps/wrastlin/meta-service/src/bets/betService.ts`**

```typescript
import { readJson, writeJson } from '../data/persistence.js';
import { loadManagers, saveManagers } from '../core/gameState.js';
import type { BetProposition, BetEntry } from '@org/betting';

export function loadPropositions(): BetProposition[] {
  try {
    return readJson<BetProposition[]>('bets/propositions.json');
  } catch {
    return [];
  }
}

export function savePropositions(propositions: BetProposition[]): void {
  writeJson('bets/propositions.json', propositions);
}

export function loadEntries(): BetEntry[] {
  try {
    return readJson<BetEntry[]>('bets/entries.json');
  } catch {
    return [];
  }
}

export function saveEntries(entries: BetEntry[]): void {
  writeJson('bets/entries.json', entries);
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

- [ ] **Step 2: Commit**

```bash
git add apps/wrastlin/meta-service/src/bets/betService.ts
git commit -m "feat(wrastlin-service): add bet persistence service"
```

---

### Task 11: Betting routes (TDD)

**Files:**
- Create: `apps/wrastlin/meta-service/src/api/bets.spec.ts`
- Create: `apps/wrastlin/meta-service/src/api/bets.ts`

Write the spec first, watch it fail, then implement the route plugin.

- [ ] **Step 1: Write failing tests**

Create `apps/wrastlin/meta-service/src/api/bets.spec.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import Fastify from 'fastify';
import { betRoutes } from './bets.js';
import * as betService from '../bets/betService.js';
import * as gameState from '../core/gameState.js';
import type { BetProposition, BetEntry } from '@org/betting';

const mockState = {
  currentWeek: 1,
  phase: 'week_open' as const,
  updatedAt: '2026-01-01T00:00:00Z',
};

const mockManager = {
  managerId: 'm-001',
  wrestlerId: 'w-001',
  money: 1000,
  trustLevel: 'medium' as const,
};

const openProposition: BetProposition = {
  propositionId: 'p-001',
  createdBy: 'm-001',
  question: 'Who wins the main event?',
  options: [
    { optionId: 'opt-a', label: 'Rex Dominion' },
    { optionId: 'opt-b', label: 'Steel Purity' },
  ],
  status: 'open',
  closesAt: '2099-01-01T00:00:00Z',
  eventKey: 1,
  createdAt: '2026-03-10T00:00:00Z',
};

const mockEntry: BetEntry = {
  entryId: 'e-001',
  propositionId: 'p-001',
  bettorId: 'm-001',
  optionId: 'opt-a',
  amount: 100,
  placedAt: '2026-03-10T01:00:00Z',
};

describe('bet routes', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  // ─── POST /bets/propositions ───────────────────────────────────────────────

  describe('POST /bets/propositions', () => {
    it('returns 201 with new proposition when phase is week_open and manager exists', async () => {
      vi.spyOn(gameState, 'loadState').mockReturnValue(mockState);
      vi.spyOn(gameState, 'loadManagers').mockReturnValue([mockManager]);
      vi.spyOn(betService, 'loadPropositions').mockReturnValue([]);
      vi.spyOn(betService, 'savePropositions').mockImplementation(() => {});
      const app = Fastify();
      await app.register(betRoutes);

      const res = await app.inject({
        method: 'POST',
        url: '/bets/propositions',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          createdBy: 'm-001',
          question: 'Who wins?',
          options: [{ optionId: 'opt-a', label: 'Rex' }],
          closesAt: '2099-01-01T00:00:00Z',
          eventKey: 1,
        }),
      });

      expect(res.statusCode).toBe(201);
      const body = JSON.parse(res.body);
      expect(typeof body.propositionId).toBe('string');
      expect(body.status).toBe('open');
      expect(body.question).toBe('Who wins?');
      await app.close();
    });

    it('returns 400 when phase is not week_open', async () => {
      vi.spyOn(gameState, 'loadState').mockReturnValue({ ...mockState, phase: 'submissions_closed' });
      const app = Fastify();
      await app.register(betRoutes);

      const res = await app.inject({
        method: 'POST',
        url: '/bets/propositions',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ createdBy: 'm-001', question: 'Who wins?', options: [], closesAt: '2099-01-01T00:00:00Z', eventKey: 1 }),
      });

      expect(res.statusCode).toBe(400);
      expect(JSON.parse(res.body)).toEqual({ error: 'Propositions can only be created during week_open phase' });
      await app.close();
    });

    it('returns 404 when manager does not exist', async () => {
      vi.spyOn(gameState, 'loadState').mockReturnValue(mockState);
      vi.spyOn(gameState, 'loadManagers').mockReturnValue([]);
      const app = Fastify();
      await app.register(betRoutes);

      const res = await app.inject({
        method: 'POST',
        url: '/bets/propositions',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ createdBy: 'unknown', question: 'Who wins?', options: [], closesAt: '2099-01-01T00:00:00Z', eventKey: 1 }),
      });

      expect(res.statusCode).toBe(404);
      expect(JSON.parse(res.body)).toEqual({ error: 'Manager not found' });
      await app.close();
    });
  });

  // ─── GET /bets/propositions ────────────────────────────────────────────────

  describe('GET /bets/propositions', () => {
    it('returns all propositions when no status filter', async () => {
      vi.spyOn(betService, 'loadPropositions').mockReturnValue([openProposition]);
      const app = Fastify();
      await app.register(betRoutes);

      const res = await app.inject({ method: 'GET', url: '/bets/propositions' });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(Array.isArray(body)).toBe(true);
      expect(body).toHaveLength(1);
      await app.close();
    });

    it('filters propositions by status query param', async () => {
      const closedProp = { ...openProposition, propositionId: 'p-002', status: 'closed' as const };
      vi.spyOn(betService, 'loadPropositions').mockReturnValue([openProposition, closedProp]);
      const app = Fastify();
      await app.register(betRoutes);

      const res = await app.inject({ method: 'GET', url: '/bets/propositions?status=open' });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body).toHaveLength(1);
      expect(body[0].propositionId).toBe('p-001');
      await app.close();
    });
  });

  // ─── GET /bets/propositions/:id ───────────────────────────────────────────

  describe('GET /bets/propositions/:id', () => {
    it('returns 200 with proposition and pool summary', async () => {
      vi.spyOn(betService, 'loadPropositions').mockReturnValue([openProposition]);
      vi.spyOn(betService, 'loadEntries').mockReturnValue([mockEntry]);
      const app = Fastify();
      await app.register(betRoutes);

      const res = await app.inject({ method: 'GET', url: '/bets/propositions/p-001' });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.propositionId).toBe('p-001');
      expect(body.pool.totalPot).toBe(100);
      expect(body.pool.byOption['opt-a']).toBe(100);
      await app.close();
    });

    it('returns 404 when proposition does not exist', async () => {
      vi.spyOn(betService, 'loadPropositions').mockReturnValue([]);
      const app = Fastify();
      await app.register(betRoutes);

      const res = await app.inject({ method: 'GET', url: '/bets/propositions/unknown' });

      expect(res.statusCode).toBe(404);
      expect(JSON.parse(res.body)).toEqual({ error: 'Proposition not found' });
      await app.close();
    });
  });

  // ─── POST /bets/propositions/:id/entries ──────────────────────────────────

  describe('POST /bets/propositions/:id/entries', () => {
    it('returns 201 with entry, saves entry first, then deducts money', async () => {
      const callOrder: string[] = [];
      vi.spyOn(betService, 'loadPropositions').mockReturnValue([openProposition]);
      vi.spyOn(gameState, 'loadState').mockReturnValue(mockState);
      vi.spyOn(gameState, 'loadManagers').mockReturnValue([mockManager]);
      vi.spyOn(betService, 'loadEntries').mockReturnValue([]);
      vi.spyOn(betService, 'saveEntries').mockImplementation(() => { callOrder.push('saveEntries'); });
      vi.spyOn(betService, 'deductMoney').mockImplementation(() => { callOrder.push('deductMoney'); });
      const app = Fastify();
      await app.register(betRoutes);

      const res = await app.inject({
        method: 'POST',
        url: '/bets/propositions/p-001/entries',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ bettorId: 'm-001', optionId: 'opt-a', amount: 100 }),
      });

      expect(res.statusCode).toBe(201);
      const body = JSON.parse(res.body);
      expect(body.bettorId).toBe('m-001');
      expect(body.amount).toBe(100);
      // Entry must be saved BEFORE money is deducted
      expect(callOrder).toEqual(['saveEntries', 'deductMoney']);
      await app.close();
    });

    it('returns 404 when proposition does not exist', async () => {
      vi.spyOn(betService, 'loadPropositions').mockReturnValue([]);
      const app = Fastify();
      await app.register(betRoutes);

      const res = await app.inject({
        method: 'POST',
        url: '/bets/propositions/unknown/entries',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ bettorId: 'm-001', optionId: 'opt-a', amount: 100 }),
      });

      expect(res.statusCode).toBe(404);
      await app.close();
    });

    it('returns 400 when proposition is not accepting bets (phase closed)', async () => {
      vi.spyOn(betService, 'loadPropositions').mockReturnValue([openProposition]);
      vi.spyOn(gameState, 'loadState').mockReturnValue({ ...mockState, phase: 'submissions_closed' });
      vi.spyOn(gameState, 'loadManagers').mockReturnValue([mockManager]);
      const app = Fastify();
      await app.register(betRoutes);

      const res = await app.inject({
        method: 'POST',
        url: '/bets/propositions/p-001/entries',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ bettorId: 'm-001', optionId: 'opt-a', amount: 100 }),
      });

      expect(res.statusCode).toBe(400);
      expect(JSON.parse(res.body)).toEqual({ error: 'This proposition is not accepting bets' });
      await app.close();
    });

    it('returns 400 when manager has insufficient funds', async () => {
      vi.spyOn(betService, 'loadPropositions').mockReturnValue([openProposition]);
      vi.spyOn(gameState, 'loadState').mockReturnValue(mockState);
      vi.spyOn(gameState, 'loadManagers').mockReturnValue([{ ...mockManager, money: 50 }]);
      vi.spyOn(betService, 'loadEntries').mockReturnValue([]);
      vi.spyOn(betService, 'deductMoney').mockImplementation(() => {});
      const app = Fastify();
      await app.register(betRoutes);

      const res = await app.inject({
        method: 'POST',
        url: '/bets/propositions/p-001/entries',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ bettorId: 'm-001', optionId: 'opt-a', amount: 100 }),
      });

      expect(res.statusCode).toBe(400);
      expect(JSON.parse(res.body)).toEqual({ error: 'Insufficient funds' });
      await app.close();
    });
  });

  // ─── GET /bets/entries ────────────────────────────────────────────────────

  describe('GET /bets/entries', () => {
    it('returns entries for the given bettorId', async () => {
      const otherEntry = { ...mockEntry, entryId: 'e-002', bettorId: 'm-002' };
      vi.spyOn(betService, 'loadEntries').mockReturnValue([mockEntry, otherEntry]);
      const app = Fastify();
      await app.register(betRoutes);

      const res = await app.inject({ method: 'GET', url: '/bets/entries?bettorId=m-001' });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body).toHaveLength(1);
      expect(body[0].bettorId).toBe('m-001');
      await app.close();
    });

    it('returns all entries when no bettorId filter is given', async () => {
      const otherEntry = { ...mockEntry, entryId: 'e-002', bettorId: 'm-002' };
      vi.spyOn(betService, 'loadEntries').mockReturnValue([mockEntry, otherEntry]);
      const app = Fastify();
      await app.register(betRoutes);

      const res = await app.inject({ method: 'GET', url: '/bets/entries' });

      expect(res.statusCode).toBe(200);
      expect(JSON.parse(res.body)).toHaveLength(2);
      await app.close();
    });
  });

  // ─── POST /bets/propositions/:id/resolve ─────────────────────────────────

  describe('POST /bets/propositions/:id/resolve', () => {
    it('returns 200 with payouts and marks proposition resolved', async () => {
      const propositionWithEntries = { ...openProposition };
      vi.spyOn(betService, 'loadPropositions').mockReturnValue([propositionWithEntries]);
      vi.spyOn(betService, 'loadEntries').mockReturnValue([mockEntry]);
      vi.spyOn(betService, 'savePropositions').mockImplementation(() => {});
      vi.spyOn(betService, 'creditMoney').mockImplementation(() => {});
      const app = Fastify();
      await app.register(betRoutes);

      const res = await app.inject({
        method: 'POST',
        url: '/bets/propositions/p-001/resolve',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ winningOptionIds: ['opt-a'] }),
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(Array.isArray(body.payouts)).toBe(true);
      expect(body.payouts[0].bettorId).toBe('m-001');
      expect(body.payouts[0].amount).toBe(100); // sole winner gets full pot
      await app.close();
    });

    it('returns 400 when proposition is already resolved', async () => {
      const resolved = { ...openProposition, status: 'resolved' as const };
      vi.spyOn(betService, 'loadPropositions').mockReturnValue([resolved]);
      const app = Fastify();
      await app.register(betRoutes);

      const res = await app.inject({
        method: 'POST',
        url: '/bets/propositions/p-001/resolve',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ winningOptionIds: ['opt-a'] }),
      });

      expect(res.statusCode).toBe(400);
      expect(JSON.parse(res.body)).toEqual({ error: 'Proposition is already resolved' });
      await app.close();
    });

    it('returns 404 when proposition does not exist', async () => {
      vi.spyOn(betService, 'loadPropositions').mockReturnValue([]);
      const app = Fastify();
      await app.register(betRoutes);

      const res = await app.inject({
        method: 'POST',
        url: '/bets/propositions/unknown/resolve',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ winningOptionIds: ['opt-a'] }),
      });

      expect(res.statusCode).toBe(404);
      await app.close();
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
pnpm nx test wrastlin-service
```

Expected: FAIL — `betRoutes` module not found.

- [ ] **Step 3: Implement `apps/wrastlin/meta-service/src/api/bets.ts`**

```typescript
import type { FastifyInstance } from 'fastify';
import { randomUUID } from 'node:crypto';
import { loadState, loadManagers } from '../core/gameState.js';
import {
  loadPropositions, savePropositions,
  loadEntries, saveEntries,
  deductMoney, creditMoney,
} from '../bets/betService.js';
import {
  buildPool, calculatePayouts, isPropositionAcceptingBets,
} from '@org/betting';
import type { BetProposition, BetEntry } from '@org/betting';

interface CreatePropositionBody {
  createdBy: string;
  question: string;
  options: { optionId: string; label: string }[];
  closesAt: string;
  eventKey: string | number;
}

interface PlaceEntryBody {
  bettorId: string;
  optionId: string;
  amount: number;
}

interface ResolveBody {
  winningOptionIds: string[];
}

export async function betRoutes(app: FastifyInstance) {
  // POST /bets/propositions — create a proposition
  app.post<{ Body: CreatePropositionBody }>('/bets/propositions', async (req, reply) => {
    const state = loadState();
    if (state.phase !== 'week_open') {
      return reply.status(400).send({ error: 'Propositions can only be created during week_open phase' });
    }

    const managers = loadManagers();
    if (!managers.find(m => m.managerId === req.body.createdBy)) {
      return reply.status(404).send({ error: 'Manager not found' });
    }

    const proposition: BetProposition = {
      propositionId: randomUUID(),
      createdBy: req.body.createdBy,
      question: req.body.question,
      options: req.body.options,
      status: 'open',
      closesAt: req.body.closesAt,
      eventKey: req.body.eventKey,
      createdAt: new Date().toISOString(),
    };

    const existing = loadPropositions();
    savePropositions([...existing, proposition]);
    return reply.status(201).send(proposition);
  });

  // GET /bets/propositions — list propositions, optional ?status= filter
  app.get<{ Querystring: { status?: string } }>('/bets/propositions', async (req) => {
    const all = loadPropositions();
    const { status } = req.query;
    return status ? all.filter(p => p.status === status) : all;
  });

  // GET /bets/propositions/:id — get proposition + pool summary
  app.get<{ Params: { id: string } }>('/bets/propositions/:id', async (req, reply) => {
    const proposition = loadPropositions().find(p => p.propositionId === req.params.id);
    if (!proposition) return reply.status(404).send({ error: 'Proposition not found' });

    const entries = loadEntries().filter(e => e.propositionId === req.params.id);
    const pool = buildPool(entries);
    return { ...proposition, pool };
  });

  // POST /bets/propositions/:id/entries — place a bet
  app.post<{ Params: { id: string }; Body: PlaceEntryBody }>(
    '/bets/propositions/:id/entries',
    async (req, reply) => {
      const proposition = loadPropositions().find(p => p.propositionId === req.params.id);
      if (!proposition) return reply.status(404).send({ error: 'Proposition not found' });

      const state = loadState();
      const now = new Date().toISOString();
      if (!isPropositionAcceptingBets(proposition, now, state.phase)) {
        return reply.status(400).send({ error: 'This proposition is not accepting bets' });
      }

      const managers = loadManagers();
      const manager = managers.find(m => m.managerId === req.body.bettorId);
      if (!manager) return reply.status(404).send({ error: 'Manager not found' });
      if (manager.money < req.body.amount) {
        return reply.status(400).send({ error: 'Insufficient funds' });
      }

      const entry: BetEntry = {
        entryId: randomUUID(),
        propositionId: req.params.id,
        bettorId: req.body.bettorId,
        optionId: req.body.optionId,
        amount: req.body.amount,
        placedAt: now,
      };

      // Write entry FIRST, then deduct money (safer crash ordering)
      const existing = loadEntries();
      saveEntries([...existing, entry]);
      deductMoney(req.body.bettorId, req.body.amount);

      return reply.status(201).send(entry);
    }
  );

  // GET /bets/entries — list entries by bettorId
  app.get<{ Querystring: { bettorId?: string } }>('/bets/entries', async (req) => {
    const all = loadEntries();
    const { bettorId } = req.query;
    return bettorId ? all.filter(e => e.bettorId === bettorId) : all;
  });

  // POST /bets/propositions/:id/resolve — resolve a proposition and pay out winners
  app.post<{ Params: { id: string }; Body: ResolveBody }>(
    '/bets/propositions/:id/resolve',
    async (req, reply) => {
      const propositions = loadPropositions();
      const proposition = propositions.find(p => p.propositionId === req.params.id);
      if (!proposition) return reply.status(404).send({ error: 'Proposition not found' });
      if (proposition.status === 'resolved') {
        return reply.status(400).send({ error: 'Proposition is already resolved' });
      }

      const { winningOptionIds } = req.body;
      const entries = loadEntries().filter(e => e.propositionId === req.params.id);
      const pool = buildPool(entries);
      const payouts = calculatePayouts(pool, entries, winningOptionIds);

      for (const payout of payouts) {
        creditMoney(payout.bettorId, payout.amount);
      }

      const resolved: BetProposition = {
        ...proposition,
        status: 'resolved',
        resolvedAt: new Date().toISOString(),
        winningOptionIds,
      };
      savePropositions(propositions.map(p => p.propositionId === resolved.propositionId ? resolved : p));

      return { proposition: resolved, payouts };
    }
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
pnpm nx test wrastlin-service
```

Expected: all tests PASS. If any fail, diagnose and fix before continuing.

- [ ] **Step 5: Commit**

```bash
git add apps/wrastlin/meta-service/src/api/bets.ts apps/wrastlin/meta-service/src/api/bets.spec.ts
git commit -m "feat(wrastlin-service): add betting routes"
```

---

### Task 12: Register routes in main.ts

**Files:**
- Modify: `apps/wrastlin/meta-service/src/main.ts`

- [ ] **Step 1: Import and register `betRoutes` in `main.ts`**

Add the import:

```typescript
import { betRoutes } from './api/bets.js';
```

Add the registration after `stateRoutes`:

```typescript
await app.register(betRoutes);
```

The full import/register block becomes:

```typescript
import { wrestlerRoutes } from './api/wrestlers.js';
import { managerRoutes } from './api/managers.js';
import { submissionRoutes } from './api/submissions.js';
import { stateRoutes } from './api/state.js';
import { betRoutes } from './api/bets.js';

// ...

await app.register(wrestlerRoutes);
await app.register(managerRoutes);
await app.register(submissionRoutes);
await app.register(stateRoutes);
await app.register(betRoutes);
```

- [ ] **Step 2: Run all wrastlin-service tests**

```bash
pnpm nx test wrastlin-service
```

Expected: all tests PASS.

- [ ] **Step 3: Commit**

```bash
git add apps/wrastlin/meta-service/src/main.ts
git commit -m "feat(wrastlin-service): register bet routes in main"
```
