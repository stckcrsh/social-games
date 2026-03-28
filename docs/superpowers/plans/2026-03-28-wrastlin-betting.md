# Wrastlin Betting System Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build an isolated, admin-driven betting system where players craft propositions, wager on outcomes, and an LLM judge resolves bets after each show.

**Architecture:** Parallel state machine (`open → closed → settled`) independent of the weekly phase. Business logic in `src/betting/`, JSONL outbox for judge/payout idempotency, parimutuel payouts written as tickets and applied in a separate admin step.

**Tech Stack:** TypeScript/ESM, Vitest, Fastify v5, OpenAI SDK (judge agent), esbuild CLI entries

---

## Chunk 1: Remove scaffolding + add types

### Task 1: Delete existing betting scaffolding and clean up aliases

**Files:**
- Delete: `libs/shared/betting/` (entire directory)
- Delete: `apps/wrastlin/meta-service/src/bets/betService.ts`
- Delete: `apps/wrastlin/meta-service/src/api/bets.ts`
- Delete: `apps/wrastlin/meta-service/src/api/bets.spec.ts`
- Modify: `tsconfig.base.json`
- Modify: `apps/wrastlin/meta-service/scripts/build.cjs`
- Modify: `apps/wrastlin/meta-service/vitest.config.mts`

- [ ] **Step 1: Delete the shared betting library**

```bash
rm -rf libs/shared/betting
```

- [ ] **Step 2: Delete meta-service betting files**

```bash
rm apps/wrastlin/meta-service/src/bets/betService.ts
rm apps/wrastlin/meta-service/src/api/bets.ts
rm apps/wrastlin/meta-service/src/api/bets.spec.ts
```

- [ ] **Step 3: Remove `@org/betting` path alias from tsconfig.base.json**

Remove this line from the `paths` block in `tsconfig.base.json`:
```json
"@org/betting": ["./libs/shared/betting/src/index.ts"]
```

- [ ] **Step 4: Remove `@org/betting` alias from build.cjs**

In `apps/wrastlin/meta-service/scripts/build.cjs`, remove the `'@org/betting': ...` line from all `alias` objects (appears in every `esbuild.buildSync` call).

- [ ] **Step 5: Remove `@org/betting` alias from vitest.config.mts**

In `apps/wrastlin/meta-service/vitest.config.mts`, remove:
```ts
'@org/betting': path.resolve(root, '../../../libs/shared/betting/src/index.ts'),
```

- [ ] **Step 6: Update game UI files to remove @org/betting imports**

The wrastlin game has scaffolding files using old `@org/betting` types. They use the old API shape (`question`, `status`, `closesAt`) which no longer exists. Update them to import from `@org/wrastlin-shared` and use the new field names.

In `apps/wrastlin/game/src/views/BettingList.tsx`, change:
```typescript
import type { BetProposition } from '@org/betting';
```
to:
```typescript
import type { BetProposition } from '@org/wrastlin-shared';
```
Also update `p.question` → `p.statement`, and remove references to `p.status` and `p.closesAt`.

In `apps/wrastlin/game/src/views/PropositionDetail.tsx`, change:
```typescript
import type { BetProposition, BetPool, BetEntry } from '@org/betting';
```
to:
```typescript
import type { BetProposition, BetEntry } from '@org/wrastlin-shared';
```
Remove all uses of `BetPool` (it is no longer a type in the new system).

In `apps/wrastlin/game/src/views/CreateProposition.spec.tsx`, `BettingList.spec.tsx`, and `PropositionDetail.spec.tsx`, change imports from `@org/betting` to `@org/wrastlin-shared` and update any field references to match new types.

In `apps/wrastlin/game/src/api/client.ts`, change:
```typescript
import type { BetProposition, BetPool, BetEntry } from '@org/betting';
```
to:
```typescript
import type { BetProposition, BetEntry } from '@org/wrastlin-shared';
```
Remove `BetPool` from any function signatures.

- [ ] **Step 7: Verify both builds compile**

```bash
pnpm nx run wrastlin-service:build
pnpm nx run @org/wrastlin-game:build
```
Expected: Both succeed with no import errors.

- [ ] **Step 8: Commit**

```bash
git add libs/shared/betting \
  apps/wrastlin/meta-service/src/bets/betService.ts \
  apps/wrastlin/meta-service/src/api/bets.ts \
  apps/wrastlin/meta-service/src/api/bets.spec.ts \
  tsconfig.base.json \
  apps/wrastlin/meta-service/scripts/build.cjs \
  apps/wrastlin/meta-service/vitest.config.mts \
  apps/wrastlin/game/src/
git commit -m "chore(wrastlin): remove betting scaffolding and @org/betting alias"

---

### Task 2: Add betting types to wrastlin-shared

**Files:**
- Create: `libs/wrastlin/shared/src/types/betting.ts`
- Modify: `libs/wrastlin/shared/src/index.ts`

- [ ] **Step 1: Create betting types**

Create `libs/wrastlin/shared/src/types/betting.ts`:
```typescript
export interface BetOption {
  optionId: string;
  label: string;
}

export interface BetProposition {
  propositionId: string;
  week: number;
  createdBy: string; // managerId
  statement: string;
  options: BetOption[];
  createdAt: string;
  judgement?: {
    winningOptionIds: string[];
    rationale: string;
    confidence: 'clear' | 'ambiguous';
  };
  resolvedAt?: string;
}

export interface BetEntry {
  entryId: string;
  propositionId: string;
  bettorId: string; // managerId
  optionId: string;
  amount: number;
  placedAt: string;
}

export type BettingPhase = 'open' | 'closed' | 'settled';

export interface BettingState {
  week: number;
  phase: BettingPhase;
  openedAt: string;
  closedAt?: string;
  settledAt?: string;
}
```

- [ ] **Step 2: Export from shared index**

In `libs/wrastlin/shared/src/index.ts`, add:
```typescript
export * from './types/betting.js';
```

- [ ] **Step 3: Commit**

```bash
git add libs/wrastlin/shared/src/types/betting.ts libs/wrastlin/shared/src/index.ts
git commit -m "feat(wrastlin): add betting types to wrastlin-shared"
```

---

## Chunk 2: Persistence + state service + open/close CLIs

### Task 3: Betting persistence helpers

**Files:**
- Create: `apps/wrastlin/meta-service/src/betting/persistence.ts`

- [ ] **Step 1: Create persistence.ts**

Create `apps/wrastlin/meta-service/src/betting/persistence.ts`:
```typescript
import path from 'path';
import { readJsonOrDefault, writeDynamicJson } from '../data/persistence.js';
import type { BettingState, BetProposition, BetEntry } from '@org/wrastlin-shared';

const DIR = 'betting';
const DYNAMIC_DIR = process.env['DYNAMIC_DATA_DIR'] ?? 'data/runtime';

export function loadBettingState(): BettingState | null {
  return readJsonOrDefault<BettingState | null>(`${DIR}/state.json`, null);
}

export function saveBettingState(state: BettingState): void {
  writeDynamicJson(`${DIR}/state.json`, state);
}

export function loadPropositions(week: number): BetProposition[] {
  return readJsonOrDefault<BetProposition[]>(`${DIR}/propositions-${week}.json`, []);
}

export function savePropositions(week: number, propositions: BetProposition[]): void {
  writeDynamicJson(`${DIR}/propositions-${week}.json`, propositions);
}

export function loadEntries(week: number): BetEntry[] {
  return readJsonOrDefault<BetEntry[]>(`${DIR}/entries-${week}.json`, []);
}

export function saveEntries(week: number, entries: BetEntry[]): void {
  writeDynamicJson(`${DIR}/entries-${week}.json`, entries);
}

export function bettingLogPath(week: number): string {
  return path.resolve(DYNAMIC_DIR, DIR, `week-${week}.jsonl`);
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/wrastlin/meta-service/src/betting/persistence.ts
git commit -m "feat(wrastlin): add betting persistence helpers"
```

---

### Task 4: Betting state service + open/close CLIs

**Files:**
- Create: `apps/wrastlin/meta-service/src/betting/stateService.ts`
- Create: `apps/wrastlin/meta-service/src/betting/stateService.spec.ts`
- Create: `apps/wrastlin/meta-service/src/run-open-betting.ts`
- Create: `apps/wrastlin/meta-service/src/run-close-betting.ts`

- [ ] **Step 1: Write failing tests**

Create `apps/wrastlin/meta-service/src/betting/stateService.spec.ts`:
```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as persistence from './persistence.js';
import * as gamePersistence from '../data/persistence.js';
import { openBetting, closeBetting } from './stateService.js';
import type { WeeklyState } from '@org/wrastlin-shared';

const mockWeeklyState: WeeklyState = {
  currentWeek: 7,
  phase: 'show_generated',
  updatedAt: '2026-03-28T10:00:00.000Z',
};

beforeEach(() => {
  vi.restoreAllMocks();
});

describe('openBetting', () => {
  it('creates betting state in open phase for current week', () => {
    vi.spyOn(gamePersistence, 'readDynamicJson').mockReturnValue(mockWeeklyState);
    vi.spyOn(persistence, 'loadBettingState').mockReturnValue(null);
    const saved = vi.spyOn(persistence, 'saveBettingState').mockImplementation(() => {});

    openBetting();

    expect(saved).toHaveBeenCalledWith(
      expect.objectContaining({ week: 7, phase: 'open' }),
    );
  });

  it('throws if weekly phase is not show_generated', () => {
    vi.spyOn(gamePersistence, 'readDynamicJson').mockReturnValue({
      ...mockWeeklyState, phase: 'week_open',
    });
    vi.spyOn(persistence, 'loadBettingState').mockReturnValue(null);

    expect(() => openBetting()).toThrow('show_generated');
  });

  it('throws if betting is already open', () => {
    vi.spyOn(gamePersistence, 'readDynamicJson').mockReturnValue(mockWeeklyState);
    vi.spyOn(persistence, 'loadBettingState').mockReturnValue({
      week: 7, phase: 'open', openedAt: '2026-03-28T10:00:00.000Z',
    });

    expect(() => openBetting()).toThrow('already open');
  });

  it('throws if betting is already closed', () => {
    vi.spyOn(gamePersistence, 'readDynamicJson').mockReturnValue(mockWeeklyState);
    vi.spyOn(persistence, 'loadBettingState').mockReturnValue({
      week: 7, phase: 'closed', openedAt: '2026-03-28T10:00:00.000Z', closedAt: '2026-03-28T11:00:00.000Z',
    });

    expect(() => openBetting()).toThrow('already closed');
  });
});

describe('closeBetting', () => {
  it('transitions open → closed', () => {
    vi.spyOn(persistence, 'loadBettingState').mockReturnValue({
      week: 7, phase: 'open', openedAt: '2026-03-28T10:00:00.000Z',
    });
    const saved = vi.spyOn(persistence, 'saveBettingState').mockImplementation(() => {});

    closeBetting();

    expect(saved).toHaveBeenCalledWith(
      expect.objectContaining({ phase: 'closed' }),
    );
  });

  it('throws if betting is not open', () => {
    vi.spyOn(persistence, 'loadBettingState').mockReturnValue(null);

    expect(() => closeBetting()).toThrow('not open');
  });
});
```

- [ ] **Step 2: Run tests — confirm FAIL**

```bash
pnpm nx test wrastlin-service --testFile=src/betting/stateService.spec.ts
```
Expected: FAIL — `stateService.js` not found.

- [ ] **Step 3: Implement stateService.ts**

Create `apps/wrastlin/meta-service/src/betting/stateService.ts`:
```typescript
import { readDynamicJson } from '../data/persistence.js';
import { loadBettingState, saveBettingState } from './persistence.js';
import type { WeeklyState } from '@org/wrastlin-shared';

export function openBetting(): void {
  const weeklyState = readDynamicJson<WeeklyState>('state.json');
  if (weeklyState.phase !== 'show_generated') {
    throw new Error(
      `Cannot open betting: weekly phase must be show_generated, got ${weeklyState.phase}`,
    );
  }

  const existing = loadBettingState();
  if (existing !== null && (existing.phase === 'open' || existing.phase === 'closed')) {
    throw new Error(`Cannot open betting: already ${existing.phase} for week ${existing.week}`);
  }

  saveBettingState({
    week: weeklyState.currentWeek,
    phase: 'open',
    openedAt: new Date().toISOString(),
  });

  console.log(`Betting opened for week ${weeklyState.currentWeek}`);
}

export function closeBetting(): void {
  const state = loadBettingState();
  if (state === null || state.phase !== 'open') {
    throw new Error('Cannot close betting: not open');
  }

  saveBettingState({ ...state, phase: 'closed', closedAt: new Date().toISOString() });
  console.log(`Betting closed for week ${state.week}`);
}
```

- [ ] **Step 4: Run tests — confirm PASS**

```bash
pnpm nx test wrastlin-service --testFile=src/betting/stateService.spec.ts
```
Expected: PASS — 6 tests green.

- [ ] **Step 5: Create CLI entry points**

Create `apps/wrastlin/meta-service/src/run-open-betting.ts`:
```typescript
import { openBetting } from './betting/stateService.js';

try {
  openBetting();
} catch (err) {
  console.error('Error:', err instanceof Error ? err.message : String(err));
  process.exit(1);
}
```

Create `apps/wrastlin/meta-service/src/run-close-betting.ts`:
```typescript
import { closeBetting } from './betting/stateService.js';

try {
  closeBetting();
} catch (err) {
  console.error('Error:', err instanceof Error ? err.message : String(err));
  process.exit(1);
}
```

- [ ] **Step 6: Commit**

```bash
git add apps/wrastlin/meta-service/src/betting/stateService.ts \
  apps/wrastlin/meta-service/src/betting/stateService.spec.ts \
  apps/wrastlin/meta-service/src/run-open-betting.ts \
  apps/wrastlin/meta-service/src/run-close-betting.ts
git commit -m "feat(wrastlin): add betting state service and open/close CLIs"
```

---

## Chunk 3: Proposition + entry services + API routes

### Task 5: Proposition service

**Files:**
- Create: `apps/wrastlin/meta-service/src/betting/propositionService.ts`
- Create: `apps/wrastlin/meta-service/src/betting/propositionService.spec.ts`

- [ ] **Step 1: Write failing tests**

Create `apps/wrastlin/meta-service/src/betting/propositionService.spec.ts`:
```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as persistence from './persistence.js';
import { createProposition } from './propositionService.js';

beforeEach(() => {
  vi.restoreAllMocks();
});

describe('createProposition', () => {
  it('throws if fewer than 2 options provided', () => {
    expect(() =>
      createProposition(7, 'm-001', 'Steve loses', [{ label: 'Yes' }]),
    ).toThrow('at least 2 options');
  });

  it('assigns generated optionIds to each option', () => {
    vi.spyOn(persistence, 'loadPropositions').mockReturnValue([]);
    vi.spyOn(persistence, 'savePropositions').mockImplementation(() => {});

    const result = createProposition(7, 'm-001', 'Steve loses', [
      { label: 'Yes' },
      { label: 'No' },
    ]);

    expect(result.options).toHaveLength(2);
    expect(result.options[0].optionId).toBeDefined();
    expect(result.options[1].optionId).toBeDefined();
    expect(result.options[0].optionId).not.toBe(result.options[1].optionId);
  });

  it('appends to existing propositions and returns the new one', () => {
    const existing = [{
      propositionId: 'prop-existing', week: 7, createdBy: 'm-000',
      statement: 'Existing', options: [], createdAt: '',
    }];
    vi.spyOn(persistence, 'loadPropositions').mockReturnValue(existing);
    const saved = vi.spyOn(persistence, 'savePropositions').mockImplementation(() => {});

    const result = createProposition(7, 'm-001', 'New bet', [{ label: 'A' }, { label: 'B' }]);

    const savedArgs = saved.mock.calls[0];
    expect(savedArgs[1]).toHaveLength(2);
    expect(result.statement).toBe('New bet');
  });
});
```

- [ ] **Step 2: Run tests — confirm FAIL**

```bash
pnpm nx test wrastlin-service --testFile=src/betting/propositionService.spec.ts
```
Expected: FAIL — `propositionService.js` not found.

- [ ] **Step 3: Create propositionService.ts**

Create `apps/wrastlin/meta-service/src/betting/propositionService.ts`:
```typescript
import { randomUUID } from 'crypto';
import { loadPropositions, savePropositions } from './persistence.js';
import type { BetProposition, BetOption } from '@org/wrastlin-shared';

export { loadPropositions };

export function createProposition(
  week: number,
  createdBy: string,
  statement: string,
  options: Pick<BetOption, 'label'>[],
): BetProposition {
  if (options.length < 2) {
    throw new Error('A proposition requires at least 2 options');
  }

  const proposition: BetProposition = {
    propositionId: randomUUID(),
    week,
    createdBy,
    statement,
    options: options.map(o => ({ optionId: randomUUID(), label: o.label })),
    createdAt: new Date().toISOString(),
  };

  const existing = loadPropositions(week);
  savePropositions(week, [...existing, proposition]);
  return proposition;
}
```

- [ ] **Step 4: Run tests — confirm PASS**

```bash
pnpm nx test wrastlin-service --testFile=src/betting/propositionService.spec.ts
```
Expected: PASS — 3 tests green.

- [ ] **Step 5: Commit**

```bash
git add apps/wrastlin/meta-service/src/betting/propositionService.ts \
  apps/wrastlin/meta-service/src/betting/propositionService.spec.ts
git commit -m "feat(wrastlin): add proposition service"
```

---

### Task 6: Entry service

**Files:**
- Create: `apps/wrastlin/meta-service/src/betting/entryService.ts`
- Create: `apps/wrastlin/meta-service/src/betting/entryService.spec.ts`

- [ ] **Step 1: Write failing tests**

Create `apps/wrastlin/meta-service/src/betting/entryService.spec.ts`:
```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as bettingPersistence from './persistence.js';
import * as gamePersistence from '../data/persistence.js';
import { placeEntry } from './entryService.js';
import type { BetProposition, Manager } from '@org/wrastlin-shared';

const proposition: BetProposition = {
  propositionId: 'prop-1',
  week: 7,
  createdBy: 'm-001',
  statement: 'Steve loses',
  options: [
    { optionId: 'opt-a', label: 'Steve wins' },
    { optionId: 'opt-b', label: 'Steve loses' },
  ],
  createdAt: '2026-03-28T10:00:00.000Z',
};

const manager: Manager = {
  managerId: 'm-002',
  wrestlerId: 'w-001',
  money: 500,
  trustLevel: 'medium',
};

beforeEach(() => {
  vi.restoreAllMocks();
});

describe('placeEntry', () => {
  it('deducts amount from manager balance and saves entry', () => {
    vi.spyOn(bettingPersistence, 'loadPropositions').mockReturnValue([proposition]);
    vi.spyOn(bettingPersistence, 'loadEntries').mockReturnValue([]);
    vi.spyOn(bettingPersistence, 'saveEntries').mockImplementation(() => {});
    vi.spyOn(gamePersistence, 'readJsonOrDefault').mockReturnValue([manager]);
    const saveManagers = vi.spyOn(gamePersistence, 'writeDynamicJson').mockImplementation(() => {});

    placeEntry(7, 'prop-1', 'm-002', 'opt-a', 100);

    expect(saveManagers).toHaveBeenCalledWith(
      'managers.json',
      expect.arrayContaining([
        expect.objectContaining({ managerId: 'm-002', money: 400 }),
      ]),
    );
  });

  it('throws if manager has insufficient funds', () => {
    vi.spyOn(bettingPersistence, 'loadPropositions').mockReturnValue([proposition]);
    vi.spyOn(gamePersistence, 'readJsonOrDefault').mockReturnValue([{ ...manager, money: 50 }]);

    expect(() => placeEntry(7, 'prop-1', 'm-002', 'opt-a', 100)).toThrow('Insufficient funds');
  });

  it('throws if proposition does not exist', () => {
    vi.spyOn(bettingPersistence, 'loadPropositions').mockReturnValue([]);
    vi.spyOn(gamePersistence, 'readJsonOrDefault').mockReturnValue([manager]);

    expect(() => placeEntry(7, 'prop-999', 'm-002', 'opt-a', 100)).toThrow('Proposition not found');
  });

  it('throws if option does not exist on proposition', () => {
    vi.spyOn(bettingPersistence, 'loadPropositions').mockReturnValue([proposition]);
    vi.spyOn(gamePersistence, 'readJsonOrDefault').mockReturnValue([manager]);

    expect(() => placeEntry(7, 'prop-1', 'm-002', 'opt-z', 100)).toThrow('Option not found');
  });
});
```

- [ ] **Step 2: Run tests — confirm FAIL**

```bash
pnpm nx test wrastlin-service --testFile=src/betting/entryService.spec.ts
```
Expected: FAIL — `entryService.js` not found.

- [ ] **Step 3: Implement entryService.ts**

Create `apps/wrastlin/meta-service/src/betting/entryService.ts`:
```typescript
import { randomUUID } from 'crypto';
import { loadPropositions, loadEntries, saveEntries } from './persistence.js';
import { readJsonOrDefault, writeDynamicJson } from '../data/persistence.js';
import type { BetEntry, Manager } from '@org/wrastlin-shared';

export { loadEntries };

export function placeEntry(
  week: number,
  propositionId: string,
  bettorId: string,
  optionId: string,
  amount: number,
): BetEntry {
  const propositions = loadPropositions(week);
  const proposition = propositions.find(p => p.propositionId === propositionId);
  if (!proposition) throw new Error(`Proposition not found: ${propositionId}`);

  const option = proposition.options.find(o => o.optionId === optionId);
  if (!option) throw new Error(`Option not found: ${optionId}`);

  const managers = readJsonOrDefault<Manager[]>('managers.json', []);
  const manager = managers.find(m => m.managerId === bettorId);
  if (!manager) throw new Error(`Manager not found: ${bettorId}`);
  if (manager.money < amount) {
    throw new Error(`Insufficient funds: has ${manager.money}, needs ${amount}`);
  }

  // Deduct balance first — if anything below fails, the deduction is the safer state
  manager.money -= amount;
  writeDynamicJson('managers.json', managers);

  const entry: BetEntry = {
    entryId: randomUUID(),
    propositionId,
    bettorId,
    optionId,
    amount,
    placedAt: new Date().toISOString(),
  };

  saveEntries(week, [...loadEntries(week), entry]);
  return entry;
}
```

- [ ] **Step 4: Run tests — confirm PASS**

```bash
pnpm nx test wrastlin-service --testFile=src/betting/entryService.spec.ts
```
Expected: PASS — 4 tests green.

- [ ] **Step 5: Commit**

```bash
git add apps/wrastlin/meta-service/src/betting/entryService.ts \
  apps/wrastlin/meta-service/src/betting/entryService.spec.ts
git commit -m "feat(wrastlin): add entry service with balance deduction"
```

---

### Task 7: Betting API routes

**Files:**
- Create: `apps/wrastlin/meta-service/src/api/betting.ts`
- Create: `apps/wrastlin/meta-service/src/api/betting.spec.ts`
- Modify: `apps/wrastlin/meta-service/src/main.ts`

- [ ] **Step 1: Write failing route tests**

Create `apps/wrastlin/meta-service/src/api/betting.spec.ts`:
```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import Fastify from 'fastify';
import { bettingRoutes } from './betting.js';
import * as persistence from '../betting/persistence.js';
import * as propositionService from '../betting/propositionService.js';
import * as entryService from '../betting/entryService.js';
import type { BettingState, BetProposition, BetEntry } from '@org/wrastlin-shared';

const openState: BettingState = {
  week: 7, phase: 'open', openedAt: '2026-03-28T10:00:00.000Z',
};

const sampleProposition: BetProposition = {
  propositionId: 'prop-1',
  week: 7,
  createdBy: 'm-001',
  statement: 'Steve loses to Vern',
  options: [
    { optionId: 'opt-a', label: 'Steve wins' },
    { optionId: 'opt-b', label: 'Steve loses' },
  ],
  createdAt: '2026-03-28T10:00:00.000Z',
};

const sampleEntry: BetEntry = {
  entryId: 'entry-1',
  propositionId: 'prop-1',
  bettorId: 'm-002',
  optionId: 'opt-a',
  amount: 50,
  placedAt: '2026-03-28T11:00:00.000Z',
};

beforeEach(() => {
  vi.restoreAllMocks();
});

describe('POST /bets/propositions', () => {
  it('creates proposition during open phase', async () => {
    vi.spyOn(persistence, 'loadBettingState').mockReturnValue(openState);
    vi.spyOn(propositionService, 'createProposition').mockReturnValue(sampleProposition);

    const app = Fastify();
    await app.register(bettingRoutes);

    const res = await app.inject({
      method: 'POST',
      url: '/bets/propositions',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        managerId: 'm-001',
        statement: 'Steve loses to Vern',
        options: [{ label: 'Steve wins' }, { label: 'Steve loses' }],
      }),
    });

    expect(res.statusCode).toBe(201);
    expect(JSON.parse(res.body).propositionId).toBe('prop-1');
    await app.close();
  });

  it('returns 409 when betting window is not open', async () => {
    vi.spyOn(persistence, 'loadBettingState').mockReturnValue(null);

    const app = Fastify();
    await app.register(bettingRoutes);

    const res = await app.inject({
      method: 'POST',
      url: '/bets/propositions',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        managerId: 'm-001',
        statement: 'Steve loses to Vern',
        options: [{ label: 'Steve wins' }, { label: 'Steve loses' }],
      }),
    });

    expect(res.statusCode).toBe(409);
    await app.close();
  });
});

describe('GET /bets/propositions', () => {
  it('returns propositions for current week', async () => {
    vi.spyOn(persistence, 'loadBettingState').mockReturnValue(openState);
    vi.spyOn(propositionService, 'loadPropositions').mockReturnValue([sampleProposition]);

    const app = Fastify();
    await app.register(bettingRoutes);

    const res = await app.inject({ method: 'GET', url: '/bets/propositions' });

    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body)).toHaveLength(1);
    await app.close();
  });

  it('returns 404 when no active betting window', async () => {
    vi.spyOn(persistence, 'loadBettingState').mockReturnValue(null);

    const app = Fastify();
    await app.register(bettingRoutes);

    const res = await app.inject({ method: 'GET', url: '/bets/propositions' });
    expect(res.statusCode).toBe(404);
    await app.close();
  });
});

describe('POST /bets/propositions/:id/entries', () => {
  it('places entry during open phase', async () => {
    vi.spyOn(persistence, 'loadBettingState').mockReturnValue(openState);
    vi.spyOn(entryService, 'placeEntry').mockReturnValue(sampleEntry);

    const app = Fastify();
    await app.register(bettingRoutes);

    const res = await app.inject({
      method: 'POST',
      url: '/bets/propositions/prop-1/entries',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ managerId: 'm-002', optionId: 'opt-a', amount: 50 }),
    });

    expect(res.statusCode).toBe(201);
    expect(JSON.parse(res.body).entryId).toBe('entry-1');
    await app.close();
  });

  it('returns 409 when betting window is closed', async () => {
    vi.spyOn(persistence, 'loadBettingState').mockReturnValue({
      ...openState, phase: 'closed',
    });

    const app = Fastify();
    await app.register(bettingRoutes);

    const res = await app.inject({
      method: 'POST',
      url: '/bets/propositions/prop-1/entries',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ managerId: 'm-002', optionId: 'opt-a', amount: 50 }),
    });

    expect(res.statusCode).toBe(409);
    await app.close();
  });
});

describe('GET /bets/entries', () => {
  it('returns entries filtered by bettorId', async () => {
    vi.spyOn(persistence, 'loadBettingState').mockReturnValue(openState);
    vi.spyOn(entryService, 'loadEntries').mockReturnValue([sampleEntry]);

    const app = Fastify();
    await app.register(bettingRoutes);

    const res = await app.inject({
      method: 'GET',
      url: '/bets/entries?bettorId=m-002',
    });

    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body)).toHaveLength(1);
    await app.close();
  });
});
```

- [ ] **Step 2: Run tests — confirm FAIL**

```bash
pnpm nx test wrastlin-service --testFile=src/api/betting.spec.ts
```
Expected: FAIL — `betting.js` not found.

- [ ] **Step 3: Create betting routes**

Create `apps/wrastlin/meta-service/src/api/betting.ts`:
```typescript
import type { FastifyInstance } from 'fastify';
import { loadBettingState } from '../betting/persistence.js';
import { createProposition, loadPropositions } from '../betting/propositionService.js';
import { placeEntry, loadEntries } from '../betting/entryService.js';

export async function bettingRoutes(app: FastifyInstance): Promise<void> {
  app.post('/bets/propositions', async (req, reply) => {
    const state = loadBettingState();
    if (state?.phase !== 'open') {
      return reply.status(409).send({ error: 'Betting window is not open' });
    }

    const { managerId, statement, options } = req.body as {
      managerId: string;
      statement: string;
      options: { label: string }[];
    };

    const proposition = createProposition(state.week, managerId, statement, options);
    return reply.status(201).send(proposition);
  });

  app.get('/bets/propositions', async (req, reply) => {
    const state = loadBettingState();
    if (state === null) {
      return reply.status(404).send({ error: 'No active betting window' });
    }
    return reply.send(loadPropositions(state.week));
  });

  app.post<{ Params: { id: string } }>(
    '/bets/propositions/:id/entries',
    async (req, reply) => {
      const state = loadBettingState();
      if (state?.phase !== 'open') {
        return reply.status(409).send({ error: 'Betting window is not open' });
      }

      const { managerId, optionId, amount } = req.body as {
        managerId: string;
        optionId: string;
        amount: number;
      };

      try {
        const entry = placeEntry(state.week, req.params.id, managerId, optionId, amount);
        return reply.status(201).send(entry);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        if (message.includes('Insufficient funds') || message.includes('not found')) {
          return reply.status(422).send({ error: message });
        }
        throw err;
      }
    },
  );

  app.get('/bets/entries', async (req, reply) => {
    const state = loadBettingState();
    if (state === null) {
      return reply.status(404).send({ error: 'No active betting window' });
    }

    const { bettorId } = req.query as { bettorId?: string };
    const entries = loadEntries(state.week);
    return reply.send(bettorId ? entries.filter(e => e.bettorId === bettorId) : entries);
  });
}
```

- [ ] **Step 4: Register routes in main.ts**

In `apps/wrastlin/meta-service/src/main.ts`, add:
```typescript
import { bettingRoutes } from './api/betting.js';
// ...inside the startup block where other routes are registered:
await app.register(bettingRoutes);
```

- [ ] **Step 5: Run tests — confirm PASS**

```bash
pnpm nx test wrastlin-service --testFile=src/api/betting.spec.ts
```
Expected: PASS — 7 tests green.

- [ ] **Step 6: Commit**

```bash
git add apps/wrastlin/meta-service/src/api/betting.ts \
  apps/wrastlin/meta-service/src/api/betting.spec.ts \
  apps/wrastlin/meta-service/src/main.ts
git commit -m "feat(wrastlin): add betting API routes"
```

---

## Chunk 4: Judge run log + payout computation + judge runner + apply-payouts CLIs

### Task 8: Betting run log

**Files:**
- Create: `apps/wrastlin/meta-service/src/betting/runLog.ts`
- Create: `apps/wrastlin/meta-service/src/betting/runLog.spec.ts`

- [ ] **Step 1: Write failing tests**

Create `apps/wrastlin/meta-service/src/betting/runLog.spec.ts`:
```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { BettingRunLog } from './runLog.js';

let tmpDir: string;
let logPath: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'betting-log-'));
  logPath = path.join(tmpDir, 'week-7.jsonl');
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true });
});

describe('BettingRunLog', () => {
  it('appends events as JSONL lines', () => {
    const log = new BettingRunLog(logPath);
    log.append({ type: 'judge_started', runId: 'run-1', week: 7, timestamp: 't' });

    const lines = fs.readFileSync(logPath, 'utf-8').trim().split('\n');
    expect(lines).toHaveLength(1);
    expect(JSON.parse(lines[0])).toMatchObject({ type: 'judge_started', week: 7 });
  });

  it('loads judgement_completed into cache on construction', () => {
    const log = new BettingRunLog(logPath);
    log.append({
      type: 'judgement_completed', runId: 'r', propositionId: 'prop-1',
      winningOptionIds: ['opt-a'], rationale: 'x', confidence: 'clear', timestamp: 't',
    });

    const reloaded = new BettingRunLog(logPath);
    expect(reloaded.isJudged('prop-1')).toBe(true);
  });

  it('loads judgement_flagged into judged cache on construction', () => {
    const log = new BettingRunLog(logPath);
    log.append({
      type: 'judgement_flagged', runId: 'r', propositionId: 'prop-2',
      reason: 'ambiguous', timestamp: 't',
    });

    const reloaded = new BettingRunLog(logPath);
    expect(reloaded.isJudged('prop-2')).toBe(true);
  });

  it('loads payout_applied into applied cache on construction', () => {
    const log = new BettingRunLog(logPath);
    log.append({
      type: 'payout_applied', runId: 'r', bettorId: 'm-001',
      entryId: 'entry-1', amount: 200, timestamp: 't',
    });

    const reloaded = new BettingRunLog(logPath);
    expect(reloaded.isPayoutApplied('entry-1')).toBe(true);
  });
});
```

- [ ] **Step 2: Run tests — confirm FAIL**

```bash
pnpm nx test wrastlin-service --testFile=src/betting/runLog.spec.ts
```
Expected: FAIL — `runLog.js` not found.

- [ ] **Step 3: Create BettingRunLog**

Create `apps/wrastlin/meta-service/src/betting/runLog.ts`:
```typescript
import fs from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';

export type BettingLogEntry =
  | { type: 'judge_started';       runId: string; week: number; timestamp: string }
  | { type: 'judgement_completed'; runId: string; propositionId: string; winningOptionIds: string[]; rationale: string; confidence: 'clear' | 'ambiguous'; timestamp: string }
  | { type: 'judgement_flagged';   runId: string; propositionId: string; reason: string; timestamp: string }
  | { type: 'payout_calculated';   runId: string; propositionId: string; payouts: { bettorId: string; entryId: string; amount: number }[]; timestamp: string }
  | { type: 'payout_applied';      runId: string; bettorId: string; entryId: string; amount: number; timestamp: string }
  | { type: 'run_completed';       runId: string; week: number; totalPaid: number; timestamp: string };

export class BettingRunLog {
  readonly runId: string;
  private readonly filePath: string;
  private readonly judgedPropositions = new Set<string>();
  private readonly appliedEntries = new Set<string>();

  constructor(filePath: string) {
    this.filePath = filePath;
    this.runId = randomUUID();

    if (fs.existsSync(filePath)) {
      const lines = fs.readFileSync(filePath, 'utf-8').split('\n').filter(Boolean);
      for (const line of lines) {
        const entry = JSON.parse(line) as BettingLogEntry;
        if (entry.type === 'judgement_completed' || entry.type === 'judgement_flagged') {
          this.judgedPropositions.add(entry.propositionId);
        }
        if (entry.type === 'payout_applied') {
          this.appliedEntries.add(entry.entryId);
        }
      }
    }
  }

  append(entry: BettingLogEntry): void {
    fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
    fs.appendFileSync(this.filePath, JSON.stringify(entry) + '\n', 'utf-8');
  }

  isJudged(propositionId: string): boolean {
    return this.judgedPropositions.has(propositionId);
  }

  isPayoutApplied(entryId: string): boolean {
    return this.appliedEntries.has(entryId);
  }

  readAllEvents(): BettingLogEntry[] {
    if (!fs.existsSync(this.filePath)) return [];
    return fs.readFileSync(this.filePath, 'utf-8')
      .split('\n')
      .filter(Boolean)
      .map(line => JSON.parse(line) as BettingLogEntry);
  }
}
```

- [ ] **Step 4: Run tests — confirm PASS**

```bash
pnpm nx test wrastlin-service --testFile=src/betting/runLog.spec.ts
```
Expected: PASS — 4 tests green.

- [ ] **Step 5: Commit**

```bash
git add apps/wrastlin/meta-service/src/betting/runLog.ts \
  apps/wrastlin/meta-service/src/betting/runLog.spec.ts
git commit -m "feat(wrastlin): add BettingRunLog for JSONL event tracking"
```

---

### Task 9: Payout computation

**Files:**
- Create: `apps/wrastlin/meta-service/src/betting/payouts.ts`
- Create: `apps/wrastlin/meta-service/src/betting/payouts.spec.ts`

- [ ] **Step 1: Write failing tests**

Create `apps/wrastlin/meta-service/src/betting/payouts.spec.ts`:
```typescript
import { describe, it, expect } from 'vitest';
import { computePayouts } from './payouts.js';
import type { BetEntry } from '@org/wrastlin-shared';

const entries: BetEntry[] = [
  { entryId: 'e-1', propositionId: 'p-1', bettorId: 'm-001', optionId: 'opt-a', amount: 100, placedAt: '' },
  { entryId: 'e-2', propositionId: 'p-1', bettorId: 'm-002', optionId: 'opt-b', amount: 60,  placedAt: '' },
  { entryId: 'e-3', propositionId: 'p-1', bettorId: 'm-003', optionId: 'opt-a', amount: 40,  placedAt: '' },
];

describe('computePayouts', () => {
  it('splits pool proportionally among winners', () => {
    const payouts = computePayouts(entries, ['opt-a']);
    // Pool: 200. Winners staked: 140. m-001 gets 200*(100/140), m-003 gets 200*(40/140)
    expect(payouts).toHaveLength(2);
    const m001 = payouts.find(p => p.bettorId === 'm-001')!;
    const m003 = payouts.find(p => p.bettorId === 'm-003')!;
    expect(m001.amount).toBeCloseTo(142.86, 1);
    expect(m003.amount).toBeCloseTo(57.14, 1);
  });

  it('returns no payouts if no entries exist for winning option (everyone loses)', () => {
    const payouts = computePayouts(entries, ['opt-c']);
    expect(payouts).toHaveLength(0);
  });

  it('returns single winner with full pool', () => {
    const solo: BetEntry[] = [
      { entryId: 'e-1', propositionId: 'p-1', bettorId: 'm-001', optionId: 'opt-a', amount: 100, placedAt: '' },
      { entryId: 'e-2', propositionId: 'p-1', bettorId: 'm-002', optionId: 'opt-b', amount: 50,  placedAt: '' },
    ];
    const payouts = computePayouts(solo, ['opt-a']);
    expect(payouts).toHaveLength(1);
    expect(payouts[0].amount).toBe(150);
  });
});
```

- [ ] **Step 2: Run tests — confirm FAIL**

```bash
pnpm nx test wrastlin-service --testFile=src/betting/payouts.spec.ts
```
Expected: FAIL — `payouts.js` not found.

- [ ] **Step 3: Implement payouts.ts**

Create `apps/wrastlin/meta-service/src/betting/payouts.ts`:
```typescript
import type { BetEntry } from '@org/wrastlin-shared';

export interface PendingPayout {
  bettorId: string;
  entryId: string;
  amount: number;
}

export function computePayouts(
  entries: BetEntry[],
  winningOptionIds: string[],
): PendingPayout[] {
  const totalPool = entries.reduce((sum, e) => sum + e.amount, 0);
  const winningEntries = entries.filter(e => winningOptionIds.includes(e.optionId));

  if (winningEntries.length === 0) return [];

  const totalStakedOnWinners = winningEntries.reduce((sum, e) => sum + e.amount, 0);

  return winningEntries.map(e => ({
    bettorId: e.bettorId,
    entryId: e.entryId,
    amount: (e.amount / totalStakedOnWinners) * totalPool,
  }));
}
```

- [ ] **Step 4: Run tests — confirm PASS**

```bash
pnpm nx test wrastlin-service --testFile=src/betting/payouts.spec.ts
```
Expected: PASS — 3 tests green.

- [ ] **Step 5: Commit**

```bash
git add apps/wrastlin/meta-service/src/betting/payouts.ts \
  apps/wrastlin/meta-service/src/betting/payouts.spec.ts
git commit -m "feat(wrastlin): add parimutuel payout computation"
```

---

### Task 10: Judge agent

**Files:**
- Create: `apps/wrastlin/meta-service/src/betting/judgeAgent.ts`

No unit test — thin OpenAI wrapper, verified via manual `run-judge` invocation.

- [ ] **Step 1: Create judgeAgent.ts**

Create `apps/wrastlin/meta-service/src/betting/judgeAgent.ts`:
```typescript
import OpenAI from 'openai';
import type { BetProposition, GeneratedShow } from '@org/wrastlin-shared';

export interface Judgement {
  winningOptionIds: string[];
  rationale: string;
  confidence: 'clear' | 'ambiguous';
}

const client = new OpenAI();

export async function judgeProposition(
  proposition: BetProposition,
  show: GeneratedShow,
): Promise<Judgement> {
  const optionsList = proposition.options
    .map(o => `- ${o.optionId}: ${o.label}`)
    .join('\n');

  const prompt = `You are judging a wrestling show betting proposition.

A bet was placed before the show: "${proposition.statement}"

Players bet on these options:
${optionsList}

The show has now happened. Full show output:
${JSON.stringify(show, null, 2)}

Based on what happened in the show, determine which option won.

Respond with JSON only, no markdown:
{
  "winningOptionIds": ["<optionId>"],
  "rationale": "<one or two sentences explaining your decision>",
  "confidence": "clear"
}

Use "ambiguous" for confidence if the show output does not contain enough information to determine a winner.
Pick exactly one optionId from the list above.`;

  const response = await client.chat.completions.create({
    model: 'gpt-4o',
    messages: [{ role: 'user', content: prompt }],
    response_format: { type: 'json_object' },
  });

  const content = response.choices[0]?.message?.content;
  if (!content) throw new Error('Empty response from judge agent');

  return JSON.parse(content) as Judgement;
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/wrastlin/meta-service/src/betting/judgeAgent.ts
git commit -m "feat(wrastlin): add OpenAI judge agent"
```

---

### Task 11: Judge runner + apply-payouts

**Files:**
- Create: `apps/wrastlin/meta-service/src/betting/judgeRunner.ts`
- Create: `apps/wrastlin/meta-service/src/betting/applyPayouts.ts`
- Create: `apps/wrastlin/meta-service/src/run-judge.ts`
- Create: `apps/wrastlin/meta-service/src/run-resolve-proposition.ts`
- Create: `apps/wrastlin/meta-service/src/run-apply-payouts.ts`

- [ ] **Step 1: Create judgeRunner.ts**

Create `apps/wrastlin/meta-service/src/betting/judgeRunner.ts`:
```typescript
import { readDynamicJson } from '../data/persistence.js';
import {
  loadBettingState,
  loadPropositions,
  savePropositions,
  loadEntries,
  bettingLogPath,
} from './persistence.js';
import { judgeProposition } from './judgeAgent.js';
import { computePayouts } from './payouts.js';
import { BettingRunLog } from './runLog.js';
import type { GeneratedShow, WeeklyState } from '@org/wrastlin-shared';

export async function runJudge(): Promise<void> {
  const bettingState = loadBettingState();
  if (bettingState?.phase !== 'closed') {
    throw new Error(
      `Cannot run judge: betting phase must be closed, got ${bettingState?.phase ?? 'none'}`,
    );
  }

  const weeklyState = readDynamicJson<WeeklyState>('state.json');
  if (weeklyState.phase !== 'show_generated') {
    throw new Error(
      `Cannot run judge: weekly phase must be show_generated, got ${weeklyState.phase}`,
    );
  }

  const show = readDynamicJson<GeneratedShow>(`shows/week-${bettingState.week}.json`);
  const propositions = loadPropositions(bettingState.week);
  const entries = loadEntries(bettingState.week);

  const log = new BettingRunLog(bettingLogPath(bettingState.week));
  log.append({
    type: 'judge_started',
    runId: log.runId,
    week: bettingState.week,
    timestamp: new Date().toISOString(),
  });

  const unresolved = propositions.filter(p => !log.isJudged(p.propositionId));

  const results = await Promise.allSettled(
    unresolved.map(async proposition => {
      const judgement = await judgeProposition(proposition, show);

      if (judgement.confidence === 'ambiguous') {
        log.append({
          type: 'judgement_flagged',
          runId: log.runId,
          propositionId: proposition.propositionId,
          reason: 'Judge returned ambiguous confidence',
          timestamp: new Date().toISOString(),
        });
        return { proposition, judgement, flagged: true };
      }

      log.append({
        type: 'judgement_completed',
        runId: log.runId,
        propositionId: proposition.propositionId,
        winningOptionIds: judgement.winningOptionIds,
        rationale: judgement.rationale,
        confidence: judgement.confidence,
        timestamp: new Date().toISOString(),
      });

      const propEntries = entries.filter(e => e.propositionId === proposition.propositionId);
      const payouts = computePayouts(propEntries, judgement.winningOptionIds);
      log.append({
        type: 'payout_calculated',
        runId: log.runId,
        propositionId: proposition.propositionId,
        payouts,
        timestamp: new Date().toISOString(),
      });

      return { proposition, judgement, flagged: false };
    }),
  );

  // Write judgements back to propositions.json
  const updatedPropositions = propositions.map(p => {
    const match = results.find(
      r => r.status === 'fulfilled' && r.value.proposition.propositionId === p.propositionId,
    );
    if (match?.status === 'fulfilled') {
      const { judgement, flagged } = match.value;
      return {
        ...p,
        judgement: {
          winningOptionIds: judgement.winningOptionIds,
          rationale: judgement.rationale,
          confidence: judgement.confidence,
        },
        resolvedAt: flagged ? undefined : new Date().toISOString(),
      };
    }
    return p;
  });
  savePropositions(bettingState.week, updatedPropositions);

  const flagged = results.filter(r => r.status === 'fulfilled' && r.value.flagged).length;
  const failed = results.filter(r => r.status === 'rejected').length;
  const resolved = results.length - flagged - failed;

  console.log(`Judge complete: ${resolved} resolved, ${flagged} need manual review, ${failed} failed`);
  if (flagged > 0) {
    const ids = updatedPropositions
      .filter(p => p.judgement?.confidence === 'ambiguous' && !p.resolvedAt)
      .map(p => p.propositionId)
      .join(', ');
    console.log(`Flagged: ${ids}`);
    console.log('Use: pnpm nx run wrastlin-service:resolve-proposition -- --id <id> --winning-option <optionId>');
  }
}
```

- [ ] **Step 2: Create applyPayouts.ts**

Create `apps/wrastlin/meta-service/src/betting/applyPayouts.ts`:
```typescript
import { readDynamicJson, writeDynamicJson } from '../data/persistence.js';
import {
  loadBettingState,
  saveBettingState,
  loadPropositions,
  bettingLogPath,
} from './persistence.js';
import { BettingRunLog } from './runLog.js';
import type { Manager } from '@org/wrastlin-shared';

export function applyPayouts(): void {
  const bettingState = loadBettingState();
  if (bettingState?.phase !== 'closed') {
    throw new Error('Cannot apply payouts: betting phase must be closed');
  }

  const propositions = loadPropositions(bettingState.week);
  const pendingReview = propositions.filter(
    p => p.judgement?.confidence === 'ambiguous' && !p.resolvedAt,
  );
  if (pendingReview.length > 0) {
    const ids = pendingReview.map(p => p.propositionId).join(', ');
    throw new Error(
      `Cannot apply payouts: ${pendingReview.length} proposition(s) need manual review: ${ids}`,
    );
  }

  const log = new BettingRunLog(bettingLogPath(bettingState.week));
  const allEvents = log.readAllEvents();
  const payoutEvents = allEvents.filter(e => e.type === 'payout_calculated') as Extract<
    (typeof allEvents)[number],
    { type: 'payout_calculated' }
  >[];

  const managers = readDynamicJson<Manager[]>('managers.json');
  let totalPaid = 0;

  for (const event of payoutEvents) {
    for (const payout of event.payouts) {
      if (log.isPayoutApplied(payout.entryId)) continue;

      const manager = managers.find(m => m.managerId === payout.bettorId);
      if (!manager) {
        console.warn(`Manager not found for payout: ${payout.bettorId}, skipping`);
        continue;
      }

      manager.money += payout.amount;
      totalPaid += payout.amount;

      log.append({
        type: 'payout_applied',
        runId: log.runId,
        bettorId: payout.bettorId,
        entryId: payout.entryId,
        amount: payout.amount,
        timestamp: new Date().toISOString(),
      });
    }
  }

  writeDynamicJson('managers.json', managers);
  saveBettingState({ ...bettingState, phase: 'settled', settledAt: new Date().toISOString() });

  log.append({
    type: 'run_completed',
    runId: log.runId,
    week: bettingState.week,
    totalPaid,
    timestamp: new Date().toISOString(),
  });

  console.log(`Payouts applied. Total paid: $${totalPaid.toFixed(2)}. Week ${bettingState.week} settled.`);
}
```

- [ ] **Step 3: Create run-judge.ts**

Create `apps/wrastlin/meta-service/src/run-judge.ts`:
```typescript
import { runJudge } from './betting/judgeRunner.js';

runJudge().catch(err => {
  console.error('Error:', err instanceof Error ? err.message : String(err));
  process.exit(1);
});
```

- [ ] **Step 4: Create run-resolve-proposition.ts**

Create `apps/wrastlin/meta-service/src/run-resolve-proposition.ts`:
```typescript
import { loadBettingState, loadPropositions, savePropositions, loadEntries, bettingLogPath } from './betting/persistence.js';
import { computePayouts } from './betting/payouts.js';
import { BettingRunLog } from './betting/runLog.js';

const args = process.argv.slice(2);
const idIdx = args.indexOf('--id');
const optIdx = args.indexOf('--winning-option');

if (idIdx === -1 || optIdx === -1) {
  console.error('Usage: run-resolve-proposition --id <propositionId> --winning-option <optionId>');
  process.exit(1);
}

const propositionId = args[idIdx + 1];
const winningOptionId = args[optIdx + 1];

try {
  const bettingState = loadBettingState();
  if (bettingState?.phase !== 'closed') throw new Error('Betting phase must be closed');

  const propositions = loadPropositions(bettingState.week);
  const proposition = propositions.find(p => p.propositionId === propositionId);
  if (!proposition) throw new Error(`Proposition not found: ${propositionId}`);

  const option = proposition.options.find(o => o.optionId === winningOptionId);
  if (!option) throw new Error(`Option not found: ${winningOptionId}`);

  savePropositions(
    bettingState.week,
    propositions.map(p =>
      p.propositionId === propositionId
        ? {
            ...p,
            judgement: { winningOptionIds: [winningOptionId], rationale: 'Manually resolved by admin', confidence: 'clear' as const },
            resolvedAt: new Date().toISOString(),
          }
        : p,
    ),
  );

  const entries = loadEntries(bettingState.week);
  const payouts = computePayouts(
    entries.filter(e => e.propositionId === propositionId),
    [winningOptionId],
  );

  const log = new BettingRunLog(bettingLogPath(bettingState.week));
  log.append({ type: 'judgement_completed', runId: log.runId, propositionId, winningOptionIds: [winningOptionId], rationale: 'Manually resolved by admin', confidence: 'clear', timestamp: new Date().toISOString() });
  log.append({ type: 'payout_calculated', runId: log.runId, propositionId, payouts, timestamp: new Date().toISOString() });

  console.log(`Resolved ${propositionId}: winning option "${option.label}". ${payouts.length} payout(s) queued.`);
} catch (err) {
  console.error('Error:', err instanceof Error ? err.message : String(err));
  process.exit(1);
}
```

- [ ] **Step 5: Create run-apply-payouts.ts**

Create `apps/wrastlin/meta-service/src/run-apply-payouts.ts`:
```typescript
import { applyPayouts } from './betting/applyPayouts.js';

try {
  applyPayouts();
} catch (err) {
  console.error('Error:', err instanceof Error ? err.message : String(err));
  process.exit(1);
}
```

- [ ] **Step 6: Commit**

```bash
git add apps/wrastlin/meta-service/src/betting/judgeRunner.ts \
  apps/wrastlin/meta-service/src/betting/applyPayouts.ts \
  apps/wrastlin/meta-service/src/run-judge.ts \
  apps/wrastlin/meta-service/src/run-resolve-proposition.ts \
  apps/wrastlin/meta-service/src/run-apply-payouts.ts
git commit -m "feat(wrastlin): add judge runner, apply-payouts, and resolve-proposition CLIs"
```

Note: `run-apply-payouts.ts` is included above — verify it is staged before committing.

---

## Chunk 5: Build config + NX targets

### Task 12: Wire up build entries and NX targets

**Files:**
- Modify: `apps/wrastlin/meta-service/scripts/build.cjs`
- Modify: `apps/wrastlin/meta-service/project.json`

- [ ] **Step 1: Add new entry points to build.cjs**

In `apps/wrastlin/meta-service/scripts/build.cjs`, add the five new entries to the same array/loop as `run-outline`, `run-beats`, etc.:

```javascript
'run-open-betting',
'run-close-betting',
'run-judge',
'run-resolve-proposition',
'run-apply-payouts',
```

Each follows the same config (ESM, `packages: 'external'`, `@org/wrastlin-shared` alias).

- [ ] **Step 2: Verify all entries build**

```bash
pnpm nx run wrastlin-service:build
ls apps/wrastlin/meta-service/dist/run-open-betting.js \
   apps/wrastlin/meta-service/dist/run-close-betting.js \
   apps/wrastlin/meta-service/dist/run-judge.js \
   apps/wrastlin/meta-service/dist/run-resolve-proposition.js \
   apps/wrastlin/meta-service/dist/run-apply-payouts.js
```
Expected: All 5 files present.

- [ ] **Step 3: Add NX targets to project.json**

In `apps/wrastlin/meta-service/project.json`, add inside the `"targets"` block:

```json
"open-betting": {
  "executor": "nx:run-commands",
  "options": {
    "command": "node scripts/build.cjs && node dist/run-open-betting.js",
    "cwd": "apps/wrastlin/meta-service"
  }
},
"close-betting": {
  "executor": "nx:run-commands",
  "options": {
    "command": "node scripts/build.cjs && node dist/run-close-betting.js",
    "cwd": "apps/wrastlin/meta-service"
  }
},
"run-judge": {
  "executor": "nx:run-commands",
  "options": {
    "command": "node scripts/build.cjs && node --env-file=.env dist/run-judge.js",
    "cwd": "apps/wrastlin/meta-service"
  }
},
"resolve-proposition": {
  "executor": "nx:run-commands",
  "options": {
    "command": "node scripts/build.cjs && node dist/run-resolve-proposition.js",
    "cwd": "apps/wrastlin/meta-service"
  }
},
"apply-payouts": {
  "executor": "nx:run-commands",
  "options": {
    "command": "node scripts/build.cjs && node dist/run-apply-payouts.js",
    "cwd": "apps/wrastlin/meta-service"
  }
}
```

- [ ] **Step 4: Run full test suite**

```bash
pnpm nx test wrastlin-service
```
Expected: All tests pass.

- [ ] **Step 5: Smoke test open-betting (requires game data in show_generated phase)**

```bash
pnpm nx run wrastlin-service:open-betting
```
Expected: `Betting opened for week N` — or a clear error if phase is wrong.

- [ ] **Step 5b: Smoke test resolve-proposition arg parsing**

With betting in `closed` phase and a known proposition ID, run:
```bash
pnpm nx run wrastlin-service:resolve-proposition -- --id <any-prop-id> --winning-option <any-opt-id>
```
Expected: Either resolves successfully, or throws a clear "Proposition not found" error — confirms `process.argv` parsing and JSONL write path work end-to-end.

- [ ] **Step 6: Commit**

```bash
git add apps/wrastlin/meta-service/scripts/build.cjs \
  apps/wrastlin/meta-service/project.json
git commit -m "feat(wrastlin): wire betting CLI entries into build and NX targets"
```
