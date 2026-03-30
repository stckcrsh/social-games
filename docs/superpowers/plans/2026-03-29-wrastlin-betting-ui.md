# Wrastlin Betting UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rewrite the wrastlin betting UI to match the new data model — global phase state, `statement`-based propositions, pool totals computed from entries, inline bet placement, and a settled-phase results view.

**Architecture:** React components read phase from `GET /bets/state` (added here) and pool totals from `GET /bets/entries` (computed client-side via a shared `computePool` helper). BettingList is phase-aware: open/closed shows the proposition list; settled renders BettingResults. PropositionDetail uses an expand-on-click inline bet form.

**Tech Stack:** React 18, React Router v6, Vite, vitest 3, @testing-library/react, @testing-library/user-event, TypeScript, `@org/wrastlin-shared`

---

## Preconditions

Backend plan (`docs/superpowers/plans/2026-03-28-wrastlin-betting.md`) Chunks 1–3 must be complete:
- `@org/betting` deleted; betting types live in `@org/wrastlin-shared`
- `GET /bets/propositions`, `POST /bets/propositions`, `POST /bets/propositions/:id/entries`, `GET /bets/entries` implemented

---

## File Map

| File | Create / Modify | Responsibility |
|------|----------------|----------------|
| `apps/wrastlin/meta-service/src/api/betting.ts` | Modify | Add `GET /bets/state` endpoint |
| `apps/wrastlin/meta-service/src/api/betting.spec.ts` | Modify | Tests for `GET /bets/state` |
| `apps/wrastlin/game/src/utils/pool.ts` | Create | `computePool(entries, propositionId)` |
| `apps/wrastlin/game/src/utils/pool.spec.ts` | Create | Unit tests for `computePool` |
| `apps/wrastlin/game/src/api/client.ts` | Modify | Update types to `@org/wrastlin-shared`; add `getBettingState`, `getAllEntries`; fix body shapes |
| `apps/wrastlin/game/src/api/client.spec.ts` | Modify | Add `getBettingState` null-on-404 test |
| `apps/wrastlin/game/src/views/BettingResults.tsx` | Create | Settled-phase view: personal P&L + all propositions |
| `apps/wrastlin/game/src/views/BettingResults.spec.tsx` | Create | RTL tests for BettingResults |
| `apps/wrastlin/game/src/views/BettingList.tsx` | Modify | Phase-aware; pool totals; settled → BettingResults |
| `apps/wrastlin/game/src/views/BettingList.spec.tsx` | Modify | Updated RTL tests |
| `apps/wrastlin/game/src/views/CreateProposition.tsx` | Modify | Use `statement`; remove `closesAt`/`eventKey` |
| `apps/wrastlin/game/src/views/CreateProposition.spec.tsx` | Modify | Updated tests |
| `apps/wrastlin/game/src/views/PropositionDetail.tsx` | Modify | Inline bet form; pool from entries; judgement display |
| `apps/wrastlin/game/src/views/PropositionDetail.spec.tsx` | Modify | Updated tests |

---

## Chunk 1: Backend endpoint + client plumbing

### Task 13: Add GET /bets/state endpoint

**Files:**
- Modify: `apps/wrastlin/meta-service/src/api/betting.ts`
- Modify: `apps/wrastlin/meta-service/src/api/betting.spec.ts`

- [ ] **Step 1: Add test for GET /bets/state**

In `apps/wrastlin/meta-service/src/api/betting.spec.ts`, append after the existing `describe('GET /bets/entries', ...)` block:

```typescript
describe('GET /bets/state', () => {
  it('returns betting state when an active window exists', async () => {
    vi.spyOn(persistence, 'loadBettingState').mockReturnValue(openState);

    const app = Fastify();
    await app.register(bettingRoutes);

    const res = await app.inject({ method: 'GET', url: '/bets/state' });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body)).toMatchObject({ week: 7, phase: 'open' });
    await app.close();
  });

  it('returns 404 when no active betting window', async () => {
    vi.spyOn(persistence, 'loadBettingState').mockReturnValue(null);

    const app = Fastify();
    await app.register(bettingRoutes);

    const res = await app.inject({ method: 'GET', url: '/bets/state' });
    expect(res.statusCode).toBe(404);
    await app.close();
  });
});
```

- [ ] **Step 2: Run test — confirm FAIL**

```bash
pnpm nx test wrastlin-service --testFile=src/api/betting.spec.ts
```
Expected: FAIL — new describe block fails with unexpected status codes.

- [ ] **Step 3: Add route to betting.ts**

In `apps/wrastlin/meta-service/src/api/betting.ts`, inside `bettingRoutes` after the `GET /bets/entries` handler, add:

```typescript
  app.get('/bets/state', async (_req, reply) => {
    const state = loadBettingState();
    if (state === null) {
      return reply.status(404).send({ error: 'No active betting window' });
    }
    return reply.send(state);
  });
```

- [ ] **Step 4: Run test — confirm PASS**

```bash
pnpm nx test wrastlin-service --testFile=src/api/betting.spec.ts
```
Expected: PASS — all tests green including the 2 new ones.

- [ ] **Step 5: Commit**

```bash
git add apps/wrastlin/meta-service/src/api/betting.ts \
  apps/wrastlin/meta-service/src/api/betting.spec.ts
git commit -m "feat(wrastlin): add GET /bets/state endpoint"
```

---

### Task 14: Add computePool utility

**Files:**
- Create: `apps/wrastlin/game/src/utils/pool.ts`
- Create: `apps/wrastlin/game/src/utils/pool.spec.ts`

- [ ] **Step 1: Write failing tests**

Create `apps/wrastlin/game/src/utils/pool.spec.ts`:

```typescript
import { computePool } from './pool.js';
import type { BetEntry } from '@org/wrastlin-shared';

const entries: BetEntry[] = [
  { entryId: 'e-1', propositionId: 'prop-1', bettorId: 'm-001', optionId: 'opt-1', amount: 50, placedAt: '' },
  { entryId: 'e-2', propositionId: 'prop-1', bettorId: 'm-002', optionId: 'opt-2', amount: 30, placedAt: '' },
  { entryId: 'e-3', propositionId: 'prop-1', bettorId: 'm-003', optionId: 'opt-1', amount: 20, placedAt: '' },
  { entryId: 'e-4', propositionId: 'prop-2', bettorId: 'm-001', optionId: 'opt-1', amount: 100, placedAt: '' },
];

describe('computePool', () => {
  it('sums amounts per option for the given proposition', () => {
    const result = computePool(entries, 'prop-1');
    expect(result.byOption).toEqual({ 'opt-1': 70, 'opt-2': 30 });
  });

  it('returns correct total', () => {
    const result = computePool(entries, 'prop-1');
    expect(result.total).toBe(100);
  });

  it('excludes entries from other propositions', () => {
    const result = computePool(entries, 'prop-1');
    expect(result.total).toBe(100); // not 200
  });

  it('returns zero total and empty byOption when no entries match', () => {
    const result = computePool(entries, 'prop-99');
    expect(result.total).toBe(0);
    expect(result.byOption).toEqual({});
  });
});
```

- [ ] **Step 2: Run test — confirm FAIL**

```bash
pnpm nx test @org/wrastlin-game --testFile=src/utils/pool.spec.ts
```
Expected: FAIL — `pool.js` not found.

- [ ] **Step 3: Create pool.ts**

Create `apps/wrastlin/game/src/utils/pool.ts`:

```typescript
import type { BetEntry } from '@org/wrastlin-shared';

export interface PoolBreakdown {
  byOption: Record<string, number>;
  total: number;
}

export function computePool(entries: BetEntry[], propositionId: string): PoolBreakdown {
  const relevant = entries.filter(e => e.propositionId === propositionId);
  const byOption: Record<string, number> = {};
  for (const e of relevant) {
    byOption[e.optionId] = (byOption[e.optionId] ?? 0) + e.amount;
  }
  return { byOption, total: relevant.reduce((sum, e) => sum + e.amount, 0) };
}
```

- [ ] **Step 4: Run test — confirm PASS**

```bash
pnpm nx test @org/wrastlin-game --testFile=src/utils/pool.spec.ts
```
Expected: PASS — 4 tests green.

- [ ] **Step 5: Commit**

```bash
git add apps/wrastlin/game/src/utils/pool.ts \
  apps/wrastlin/game/src/utils/pool.spec.ts
git commit -m "feat(wrastlin): add computePool utility"
```

---

### Task 15: Update game API client

**Files:**
- Modify: `apps/wrastlin/game/src/api/client.ts`
- Modify: `apps/wrastlin/game/src/api/client.spec.ts`

- [ ] **Step 1: Add getBettingState null-on-404 test**

In `apps/wrastlin/game/src/api/client.spec.ts`, append inside the `describe('ApiError propagation', ...)` block:

```typescript
  it('getBettingState returns null when server returns 404', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: false,
      status: 404,
      json: () => Promise.resolve({ error: 'No active betting window' }),
    } as Response);

    const result = await api.getBettingState();
    expect(result).toBeNull();
  });
```

- [ ] **Step 2: Run test — confirm FAIL**

```bash
pnpm nx test @org/wrastlin-game --testFile=src/api/client.spec.ts
```
Expected: FAIL — `api.getBettingState` does not exist yet.

- [ ] **Step 3: Rewrite client.ts**

Replace the entire contents of `apps/wrastlin/game/src/api/client.ts` with:

```typescript
import type {
  Wrestler,
  Manager,
  WeeklySubmission,
  WeeklyState,
  ManagerAdvice,
  StoryRequest,
  BetProposition,
  BetEntry,
  BettingState,
} from '@org/wrastlin-shared';

const BASE = '/api'; // proxied to http://localhost:3002 by Vite

export class ApiError extends Error {
  constructor(public readonly serverMessage: string, public readonly status: number) {
    super(serverMessage);
    this.name = 'ApiError';
  }
}

async function get<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new ApiError(
      (body as { error?: string }).error ?? `request failed: ${res.status}`,
      res.status
    );
  }
  return res.json() as Promise<T>;
}

async function post<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const errBody = await res.json().catch(() => ({}));
    throw new ApiError(
      (errBody as { error?: string }).error ?? `request failed: ${res.status}`,
      res.status
    );
  }
  return res.json() as Promise<T>;
}

interface CreatePropositionBody {
  managerId: string;
  statement: string;
  options: { label: string }[];
}

interface PlaceEntryBody {
  managerId: string;
  optionId: string;
  amount: number;
}

export const api = {
  // Wrestler / manager
  getWrestlers: () => get<Wrestler[]>('/wrestlers'),
  getWrestler: (id: string) => get<Wrestler>(`/wrestlers/${id}`),
  getManager: (id: string) => get<Manager>(`/managers/${id}`),
  getState: () => get<WeeklyState>('/state'),

  // Submissions
  submitWeek: (managerId: string, advice: ManagerAdvice, storyRequests: StoryRequest[], wrestlerMessage?: string) =>
    post<WeeklySubmission>('/submissions', { managerId, advice, storyRequests, wrestlerMessage }),
  getSubmissions: (week: number) => get<WeeklySubmission[]>(`/submissions/week/${week}`),

  // Betting
  getBettingState: async (): Promise<BettingState | null> => {
    try {
      return await get<BettingState>('/bets/state');
    } catch (e) {
      if (e instanceof ApiError && e.status === 404) return null;
      throw e;
    }
  },
  getPropositions: () => get<BetProposition[]>('/bets/propositions'),
  getProposition: (id: string) => get<BetProposition>(`/bets/propositions/${id}`),
  createProposition: (body: CreatePropositionBody) => post<BetProposition>('/bets/propositions', body),
  placeBet: (propositionId: string, body: PlaceEntryBody) =>
    post<BetEntry>(`/bets/propositions/${propositionId}/entries`, body),
  getMyEntries: (bettorId: string) => get<BetEntry[]>(`/bets/entries?bettorId=${bettorId}`),
  getAllEntries: () => get<BetEntry[]>('/bets/entries'),
};
```

- [ ] **Step 4: Run all game tests — confirm PASS**

```bash
pnpm nx test @org/wrastlin-game
```
Expected: PASS — all existing tests still green, new `getBettingState` test also green.

- [ ] **Step 5: Commit**

```bash
git add apps/wrastlin/game/src/api/client.ts \
  apps/wrastlin/game/src/api/client.spec.ts
git commit -m "feat(wrastlin): update betting API client for new data model"
```

---

## Chunk 2: Views

### Task 16: Create BettingResults component

**Files:**
- Create: `apps/wrastlin/game/src/views/BettingResults.tsx`
- Create: `apps/wrastlin/game/src/views/BettingResults.spec.tsx`

- [ ] **Step 1: Write failing tests**

Create `apps/wrastlin/game/src/views/BettingResults.spec.tsx`:

```typescript
import { render, screen } from '@testing-library/react';
import { BettingResults } from './BettingResults.js';
import type { BetProposition, BetEntry, BettingState } from '@org/wrastlin-shared';

const state: BettingState = {
  week: 7,
  phase: 'settled',
  openedAt: '2026-03-28T10:00:00.000Z',
  settledAt: '2026-03-29T12:00:00.000Z',
};

const resolvedProp: BetProposition = {
  propositionId: 'prop-1',
  week: 7,
  createdBy: 'm-001',
  statement: 'Dazzling Steve will lose to Vern',
  options: [
    { optionId: 'opt-1', label: 'Yes' },
    { optionId: 'opt-2', label: 'No' },
  ],
  createdAt: '2026-03-28T10:00:00.000Z',
  judgement: {
    winningOptionIds: ['opt-1'],
    rationale: 'Steve was submitted in round 2.',
    confidence: 'clear',
  },
  resolvedAt: '2026-03-29T11:00:00.000Z',
};

const ambiguousProp: BetProposition = {
  ...resolvedProp,
  propositionId: 'prop-2',
  statement: 'Will there be a surprise run-in?',
  options: [
    { optionId: 'opt-a', label: 'Yes' },
    { optionId: 'opt-b', label: 'No' },
  ],
  judgement: {
    winningOptionIds: ['opt-a'],
    rationale: 'Technically yes but debatable.',
    confidence: 'ambiguous',
  },
  resolvedAt: undefined,
};

// m-001 bet $50 on opt-1 (winner). Pool: $50 + $30 = $80, all on winner side = $50.
// Payout = (50/50) * 80 = $80. Net = +$30.
const allEntries: BetEntry[] = [
  { entryId: 'e-1', propositionId: 'prop-1', bettorId: 'm-001', optionId: 'opt-1', amount: 50, placedAt: '' },
  { entryId: 'e-2', propositionId: 'prop-1', bettorId: 'm-002', optionId: 'opt-2', amount: 30, placedAt: '' },
];

const allEntriesWithAmbiguous: BetEntry[] = [
  ...allEntries,
  { entryId: 'e-3', propositionId: 'prop-2', bettorId: 'm-001', optionId: 'opt-a', amount: 25, placedAt: '' },
];

describe('BettingResults', () => {
  it('shows week number in heading', () => {
    render(<BettingResults state={state} propositions={[resolvedProp]} allEntries={allEntries} managerId="m-001" />);
    expect(screen.getByText(/Week 7/)).toBeInTheDocument();
  });

  it('shows net profit for a winning bet', () => {
    render(<BettingResults state={state} propositions={[resolvedProp]} allEntries={allEntries} managerId="m-001" />);
    expect(screen.getByText(/\+\$30/)).toBeInTheDocument();
  });

  it('shows net loss when all bets lose', () => {
    render(<BettingResults state={state} propositions={[resolvedProp]} allEntries={allEntries} managerId="m-002" />);
    expect(screen.getByText(/-\$30/)).toBeInTheDocument();
  });

  it('shows win and loss counts', () => {
    render(<BettingResults state={state} propositions={[resolvedProp]} allEntries={allEntries} managerId="m-001" />);
    expect(screen.getByText(/1 win/)).toBeInTheDocument();
    expect(screen.getByText(/0 loss/)).toBeInTheDocument();
  });

  it('shows stake and payout for a winning bet', () => {
    render(<BettingResults state={state} propositions={[resolvedProp]} allEntries={allEntries} managerId="m-001" />);
    expect(screen.getByText(/Bet \$50 on Yes → won \$80/)).toBeInTheDocument();
  });

  it('shows lost amount for a losing bet', () => {
    render(<BettingResults state={state} propositions={[resolvedProp]} allEntries={allEntries} managerId="m-002" />);
    expect(screen.getByText(/Bet \$30 on No → lost \$30/)).toBeInTheDocument();
  });

  it('shows all proposition statements', () => {
    render(<BettingResults state={state} propositions={[resolvedProp]} allEntries={allEntries} managerId="m-001" />);
    expect(screen.getByText('Dazzling Steve will lose to Vern')).toBeInTheDocument();
  });

  it('highlights winning option with "(winner)" label', () => {
    render(<BettingResults state={state} propositions={[resolvedProp]} allEntries={allEntries} managerId="m-001" />);
    expect(screen.getByText(/Yes.*winner/i)).toBeInTheDocument();
  });

  it('shows judge rationale', () => {
    render(<BettingResults state={state} propositions={[resolvedProp]} allEntries={allEntries} managerId="m-001" />);
    expect(screen.getByText('Steve was submitted in round 2.')).toBeInTheDocument();
  });

  it('shows manual review badge for ambiguous unresolved proposition', () => {
    render(<BettingResults state={state} propositions={[resolvedProp, ambiguousProp]} allEntries={allEntriesWithAmbiguous} managerId="m-001" />);
    expect(screen.getByText(/Awaiting manual review/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test — confirm FAIL**

```bash
pnpm nx test @org/wrastlin-game --testFile=src/views/BettingResults.spec.tsx
```
Expected: FAIL — `BettingResults.js` not found.

- [ ] **Step 3: Create BettingResults.tsx**

Create `apps/wrastlin/game/src/views/BettingResults.tsx`:

```typescript
import type { BetProposition, BetEntry, BettingState } from '@org/wrastlin-shared';
import { computePool } from '../utils/pool.js';

interface BettingResultsProps {
  state: BettingState;
  propositions: BetProposition[];
  allEntries: BetEntry[];
  managerId: string;
}

function computePayout(proposition: BetProposition, entry: BetEntry, allEntries: BetEntry[]): number {
  if (!proposition.judgement) return 0;
  const { winningOptionIds } = proposition.judgement;
  if (!winningOptionIds.includes(entry.optionId)) return 0;
  const { byOption, total } = computePool(allEntries, proposition.propositionId);
  const totalOnWinner = winningOptionIds.reduce((sum, id) => sum + (byOption[id] ?? 0), 0);
  if (totalOnWinner === 0) return 0;
  return (entry.amount / totalOnWinner) * total;
}

export function BettingResults({ state, propositions, allEntries, managerId }: BettingResultsProps) {
  const myEntries = allEntries.filter(e => e.bettorId === managerId);

  const myBetResults = myEntries.flatMap(entry => {
    const proposition = propositions.find(p => p.propositionId === entry.propositionId);
    if (!proposition) return [];
    const option = proposition.options.find(o => o.optionId === entry.optionId);
    const payout = proposition.judgement ? computePayout(proposition, entry, allEntries) : null;
    const won = payout !== null && payout > 0;
    return [{ entry, proposition, option, payout, won, isResolved: !!proposition.judgement }];
  });

  const resolvedBets = myBetResults.filter(r => r.isResolved);
  const wins = resolvedBets.filter(r => r.won).length;
  const losses = resolvedBets.filter(r => !r.won).length;
  const netPL = resolvedBets.reduce((sum, r) =>
    sum + (r.won ? (r.payout! - r.entry.amount) : -r.entry.amount), 0);

  return (
    <div style={{ padding: '1rem' }}>
      <h2>My Results — Week {state.week}</h2>
      <p>
        Net:{' '}
        <strong style={{ color: netPL >= 0 ? 'green' : 'red' }}>
          {netPL >= 0 ? '+' : '-'}${Math.abs(netPL).toFixed(0)}
        </strong>
        {' '}· {wins} win{wins !== 1 ? 's' : ''}, {losses} loss{losses !== 1 ? 'es' : ''}
      </p>

      {myBetResults.length > 0 && (
        <ul style={{ listStyle: 'none', padding: 0, marginBottom: '2rem' }}>
          {myBetResults.map(({ entry, option, payout, won, isResolved }) => (
            <li key={entry.entryId} style={{ marginBottom: '0.25rem' }}>
              Bet ${entry.amount} on {option?.label ?? entry.optionId}
              {isResolved && payout !== null
                ? won
                  ? ` → won $${Math.round(payout)}`
                  : ` → lost $${entry.amount}`
                : ' → awaiting result'}
            </li>
          ))}
        </ul>
      )}

      <h3>All Propositions</h3>
      <ul style={{ listStyle: 'none', padding: 0 }}>
        {propositions.map(p => {
          const pool = computePool(allEntries, p.propositionId);
          const isAmbiguousPending = p.judgement?.confidence === 'ambiguous' && !p.resolvedAt;
          return (
            <li key={p.propositionId} style={{ marginBottom: '1rem', borderBottom: '1px solid #eee', paddingBottom: '1rem' }}>
              <strong>{p.statement}</strong>
              {isAmbiguousPending && (
                <span style={{ marginLeft: '0.5rem', color: 'orange' }}>⚠ Awaiting manual review</span>
              )}
              <ul style={{ margin: '0.25rem 0 0.25rem 1rem' }}>
                {p.options.map(opt => {
                  const isWinner = p.judgement?.winningOptionIds.includes(opt.optionId);
                  return (
                    <li key={opt.optionId}>
                      {opt.label}{isWinner ? ' (winner)' : ''} — ${pool.byOption[opt.optionId] ?? 0} in pool
                    </li>
                  );
                })}
              </ul>
              {p.judgement && (
                <p style={{ margin: '0.25rem 0', fontStyle: 'italic' }}>{p.judgement.rationale}</p>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
```

- [ ] **Step 4: Run test — confirm PASS**

```bash
pnpm nx test @org/wrastlin-game --testFile=src/views/BettingResults.spec.tsx
```
Expected: PASS — all 10 tests green.

- [ ] **Step 5: Commit**

```bash
git add apps/wrastlin/game/src/views/BettingResults.tsx \
  apps/wrastlin/game/src/views/BettingResults.spec.tsx
git commit -m "feat(wrastlin): add BettingResults settled-phase view"
```

---

### Task 17: Rewrite BettingList

**Files:**
- Modify: `apps/wrastlin/game/src/views/BettingList.tsx`
- Modify: `apps/wrastlin/game/src/views/BettingList.spec.tsx`

- [ ] **Step 1: Write failing tests**

Replace `apps/wrastlin/game/src/views/BettingList.spec.tsx` with:

```typescript
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { api } from '../api/client.js';
import { BettingList } from './BettingList.js';
import type { BetProposition, BetEntry, BettingState } from '@org/wrastlin-shared';

vi.mock('../api/client.js', () => ({
  api: {
    getBettingState: vi.fn(),
    getPropositions: vi.fn(),
    getAllEntries: vi.fn(),
  },
}));

vi.mock('./BettingResults.js', () => ({
  BettingResults: ({ state }: { state: BettingState }) => (
    <div data-testid="betting-results">Results for week {state.week}</div>
  ),
}));

const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return { ...actual, useNavigate: () => mockNavigate };
});

const openState: BettingState = { week: 7, phase: 'open', openedAt: '2026-03-28T10:00:00.000Z' };
const closedState: BettingState = { ...openState, phase: 'closed', closedAt: '2026-03-28T20:00:00.000Z' };
const settledState: BettingState = { ...closedState, phase: 'settled', settledAt: '2026-03-29T10:00:00.000Z' };

const proposition: BetProposition = {
  propositionId: 'prop-1',
  week: 7,
  createdBy: 'm-001',
  statement: 'Dazzling Steve will lose to Vern',
  options: [
    { optionId: 'opt-1', label: 'Yes' },
    { optionId: 'opt-2', label: 'No' },
  ],
  createdAt: '2026-03-28T10:00:00.000Z',
};

const entries: BetEntry[] = [
  { entryId: 'e-1', propositionId: 'prop-1', bettorId: 'm-001', optionId: 'opt-1', amount: 50, placedAt: '' },
  { entryId: 'e-2', propositionId: 'prop-1', bettorId: 'm-002', optionId: 'opt-2', amount: 30, placedAt: '' },
];

function renderList() {
  return render(<MemoryRouter><BettingList /></MemoryRouter>);
}

describe('BettingList', () => {
  beforeEach(() => {
    vi.mocked(api.getPropositions).mockResolvedValue([proposition]);
    vi.mocked(api.getAllEntries).mockResolvedValue(entries);
    mockNavigate.mockReset();
  });

  it('shows loading state initially', () => {
    vi.mocked(api.getBettingState).mockResolvedValue(openState);
    renderList();
    expect(screen.getByText('Loading...')).toBeInTheDocument();
  });

  it('shows "No active betting window" when state is null', async () => {
    vi.mocked(api.getBettingState).mockResolvedValue(null);
    renderList();
    await waitFor(() => {
      expect(screen.getByText('No active betting window')).toBeInTheDocument();
    });
  });

  it('shows proposition statement as a link', async () => {
    vi.mocked(api.getBettingState).mockResolvedValue(openState);
    renderList();
    await waitFor(() => {
      expect(screen.getByRole('link', { name: 'Dazzling Steve will lose to Vern' })).toBeInTheDocument();
    });
  });

  it('shows total pool per proposition', async () => {
    vi.mocked(api.getBettingState).mockResolvedValue(openState);
    renderList();
    await waitFor(() => {
      expect(screen.getByText(/Pool: \$80/)).toBeInTheDocument();
    });
  });

  it('shows per-option pool amounts', async () => {
    vi.mocked(api.getBettingState).mockResolvedValue(openState);
    renderList();
    await waitFor(() => {
      expect(screen.getByText(/Yes.*\$50/)).toBeInTheDocument();
      expect(screen.getByText(/No.*\$30/)).toBeInTheDocument();
    });
  });

  it('shows "Create Proposition" button when phase is open', async () => {
    vi.mocked(api.getBettingState).mockResolvedValue(openState);
    renderList();
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Create Proposition' })).toBeInTheDocument();
    });
  });

  it('does NOT show "Create Proposition" button when phase is closed', async () => {
    vi.mocked(api.getBettingState).mockResolvedValue(closedState);
    renderList();
    await waitFor(() => {
      expect(screen.queryByRole('button', { name: 'Create Proposition' })).not.toBeInTheDocument();
    });
  });

  it('navigates to /bets/new when "Create Proposition" is clicked', async () => {
    vi.mocked(api.getBettingState).mockResolvedValue(openState);
    const user = userEvent.setup();
    renderList();
    await waitFor(() => screen.getByRole('button', { name: 'Create Proposition' }));
    await user.click(screen.getByRole('button', { name: 'Create Proposition' }));
    expect(mockNavigate).toHaveBeenCalledWith('/bets/new');
  });

  it('renders BettingResults when phase is settled', async () => {
    vi.mocked(api.getBettingState).mockResolvedValue(settledState);
    renderList();
    await waitFor(() => {
      expect(screen.getByTestId('betting-results')).toBeInTheDocument();
    });
  });

  it('renders error message when getBettingState rejects', async () => {
    vi.mocked(api.getBettingState).mockRejectedValue(new Error('Server down'));
    renderList();
    await waitFor(() => {
      expect(screen.getByText('Error: Server down')).toBeInTheDocument();
    });
  });
});
```

- [ ] **Step 2: Run test — confirm FAIL**

```bash
pnpm nx test @org/wrastlin-game --testFile=src/views/BettingList.spec.tsx
```
Expected: FAIL — old shape tests break.

- [ ] **Step 3: Rewrite BettingList.tsx**

Replace `apps/wrastlin/game/src/views/BettingList.tsx` with:

```typescript
import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../api/client.js';
import { computePool } from '../utils/pool.js';
import { BettingResults } from './BettingResults.js';
import type { BetProposition, BetEntry, BettingState } from '@org/wrastlin-shared';

const MANAGER_ID = 'm-001';

export function BettingList() {
  const [state, setState] = useState<BettingState | null | undefined>(undefined);
  const [propositions, setPropositions] = useState<BetProposition[]>([]);
  const [allEntries, setAllEntries] = useState<BetEntry[]>([]);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    api.getBettingState()
      .then(async (s) => {
        setState(s);
        if (s !== null) {
          const [props, entries] = await Promise.all([
            api.getPropositions(),
            api.getAllEntries(),
          ]);
          setPropositions(props);
          setAllEntries(entries);
        }
      })
      .catch((e: Error) => setError(e.message));
  }, []);

  if (error) return <p style={{ color: 'red' }}>Error: {error}</p>;
  if (state === undefined) return <p>Loading...</p>;
  if (state === null) return <p>No active betting window</p>;

  if (state.phase === 'settled') {
    return (
      <BettingResults
        state={state}
        propositions={propositions}
        allEntries={allEntries}
        managerId={MANAGER_ID}
      />
    );
  }

  return (
    <div style={{ padding: '1rem' }}>
      <h2>Betting — Week {state.week}</h2>
      {state.phase === 'open' && (
        <button onClick={() => navigate('/bets/new')} style={{ marginBottom: '1rem' }}>
          Create Proposition
        </button>
      )}
      {state.phase === 'closed' && (
        <p style={{ color: 'gray', marginBottom: '1rem' }}>Betting closed — awaiting results</p>
      )}
      <ul style={{ listStyle: 'none', padding: 0 }}>
        {propositions.map(p => {
          const pool = computePool(allEntries, p.propositionId);
          return (
            <li key={p.propositionId} style={{ marginBottom: '1rem', borderBottom: '1px solid #eee', paddingBottom: '0.5rem' }}>
              <Link to={`/bets/${p.propositionId}`}>{p.statement}</Link>
              <span style={{ marginLeft: '0.5rem', color: 'gray' }}>Pool: ${pool.total}</span>
              <ul style={{ margin: '0.25rem 0 0 1rem', listStyle: 'none', padding: 0 }}>
                {p.options.map(opt => (
                  <li key={opt.optionId} style={{ fontSize: '0.875rem', color: 'gray' }}>
                    {opt.label}: ${pool.byOption[opt.optionId] ?? 0}
                  </li>
                ))}
              </ul>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
```

- [ ] **Step 4: Run test — confirm PASS**

```bash
pnpm nx test @org/wrastlin-game --testFile=src/views/BettingList.spec.tsx
```
Expected: PASS — all tests green.

- [ ] **Step 5: Commit**

```bash
git add apps/wrastlin/game/src/views/BettingList.tsx \
  apps/wrastlin/game/src/views/BettingList.spec.tsx
git commit -m "feat(wrastlin): rewrite BettingList with phase awareness and pool totals"
```

---

### Task 18: Rewrite CreateProposition

**Files:**
- Modify: `apps/wrastlin/game/src/views/CreateProposition.tsx`
- Modify: `apps/wrastlin/game/src/views/CreateProposition.spec.tsx`

- [ ] **Step 1: Write failing tests**

Replace `apps/wrastlin/game/src/views/CreateProposition.spec.tsx` with:

```typescript
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { api, ApiError } from '../api/client.js';
import { CreateProposition } from './CreateProposition.js';
import type { BetProposition } from '@org/wrastlin-shared';

const mockNavigate = vi.fn();

vi.mock('../api/client.js', () => ({
  api: { createProposition: vi.fn() },
  ApiError: class ApiError extends Error {
    serverMessage: string;
    status: number;
    constructor(msg: string, status: number) {
      super(msg);
      this.serverMessage = msg;
      this.status = status;
    }
  },
}));

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return { ...actual, useNavigate: () => mockNavigate };
});

const fixtureProp: BetProposition = {
  propositionId: 'new-prop-1',
  week: 7,
  createdBy: 'm-001',
  statement: 'Test statement',
  options: [{ optionId: 'opt-1', label: 'A' }, { optionId: 'opt-2', label: 'B' }],
  createdAt: '2026-03-28T10:00:00.000Z',
};

function renderForm() {
  return render(<MemoryRouter><CreateProposition /></MemoryRouter>);
}

describe('CreateProposition', () => {
  beforeEach(() => {
    vi.mocked(api.createProposition).mockResolvedValue(fixtureProp);
    mockNavigate.mockReset();
  });

  it('renders Statement input', () => {
    renderForm();
    expect(screen.getByLabelText('Statement')).toBeInTheDocument();
  });

  it('does NOT render Closes At or Event Key inputs', () => {
    renderForm();
    expect(screen.queryByLabelText('Closes At')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Event Key')).not.toBeInTheDocument();
  });

  it('renders 2 option rows by default', () => {
    renderForm();
    expect(screen.getByLabelText('Option 1')).toBeInTheDocument();
    expect(screen.getByLabelText('Option 2')).toBeInTheDocument();
  });

  it('"Add option" appends a new row', async () => {
    const user = userEvent.setup();
    renderForm();
    await user.click(screen.getByRole('button', { name: 'Add option' }));
    expect(screen.getByLabelText('Option 3')).toBeInTheDocument();
  });

  it('"Remove" removes that option row', async () => {
    const user = userEvent.setup();
    renderForm();
    await user.click(screen.getAllByRole('button', { name: 'Remove' })[0]);
    expect(screen.getByLabelText('Option 1')).toBeInTheDocument();
    expect(screen.queryByLabelText('Option 2')).not.toBeInTheDocument();
  });

  it('submit calls createProposition with correct shape', async () => {
    const user = userEvent.setup();
    renderForm();
    await user.type(screen.getByLabelText('Statement'), 'Steve will lose');
    await user.type(screen.getByLabelText('Option 1'), 'Yes');
    await user.type(screen.getByLabelText('Option 2'), 'No');
    await user.click(screen.getByRole('button', { name: 'Create' }));
    await waitFor(() => {
      expect(vi.mocked(api.createProposition)).toHaveBeenCalledWith({
        managerId: 'm-001',
        statement: 'Steve will lose',
        options: [{ label: 'Yes' }, { label: 'No' }],
      });
    });
  });

  it('navigates to /bets/:id on success', async () => {
    const user = userEvent.setup();
    renderForm();
    await user.type(screen.getByLabelText('Statement'), 'Test');
    await user.click(screen.getByRole('button', { name: 'Create' }));
    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('/bets/new-prop-1');
    });
  });

  it('shows serverMessage on ApiError', async () => {
    const { ApiError: Err } = await import('../api/client.js');
    vi.mocked(api.createProposition).mockRejectedValue(new Err('Betting window is not open', 409));
    const user = userEvent.setup();
    renderForm();
    await user.type(screen.getByLabelText('Statement'), 'Test');
    await user.click(screen.getByRole('button', { name: 'Create' }));
    await waitFor(() => {
      expect(screen.getByText('Betting window is not open')).toBeInTheDocument();
    });
  });

  it('shows generic error on non-ApiError failure', async () => {
    vi.mocked(api.createProposition).mockRejectedValue(new Error('Network error'));
    const user = userEvent.setup();
    renderForm();
    await user.type(screen.getByLabelText('Statement'), 'Test');
    await user.click(screen.getByRole('button', { name: 'Create' }));
    await waitFor(() => {
      expect(screen.getByText('Network error')).toBeInTheDocument();
    });
  });
});
```

- [ ] **Step 2: Run test — confirm FAIL**

```bash
pnpm nx test @org/wrastlin-game --testFile=src/views/CreateProposition.spec.tsx
```
Expected: FAIL — old `question`/`closesAt`/`eventKey` shape tests fail.

- [ ] **Step 3: Rewrite CreateProposition.tsx**

Replace `apps/wrastlin/game/src/views/CreateProposition.tsx` with:

```typescript
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, ApiError } from '../api/client.js';

const MANAGER_ID = 'm-001';

export function CreateProposition() {
  const navigate = useNavigate();
  const [statement, setStatement] = useState('');
  const [options, setOptions] = useState(['', '']);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  function addOption() {
    setOptions(prev => [...prev, '']);
  }

  function removeOption(index: number) {
    setOptions(prev => prev.filter((_, i) => i !== index));
  }

  function updateOption(index: number, value: string) {
    setOptions(prev => prev.map((o, i) => (i === index ? value : o)));
  }

  async function submit() {
    setError('');
    setSubmitting(true);
    try {
      const result = await api.createProposition({
        managerId: MANAGER_ID,
        statement,
        options: options.map(label => ({ label })),
      });
      navigate(`/bets/${result.propositionId}`);
    } catch (e) {
      setError(e instanceof ApiError ? e.serverMessage : (e as Error).message);
      setSubmitting(false);
    }
  }

  return (
    <div style={{ padding: '1rem', maxWidth: '500px' }}>
      <h2>Create Proposition</h2>

      <div style={{ marginBottom: '0.5rem' }}>
        <label htmlFor="statement">Statement</label>
        <br />
        <input
          id="statement"
          value={statement}
          onChange={e => setStatement(e.target.value)}
          style={{ width: '100%' }}
        />
      </div>

      <h3>Options</h3>
      {options.map((opt, i) => (
        <div key={i} style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.25rem' }}>
          <label htmlFor={`opt-input-${i + 1}`}>Option {i + 1}</label>
          <input
            id={`opt-input-${i + 1}`}
            aria-label={`Option ${i + 1}`}
            value={opt}
            onChange={e => updateOption(i, e.target.value)}
          />
          <button type="button" onClick={() => removeOption(i)}>Remove</button>
        </div>
      ))}
      <button type="button" onClick={addOption} style={{ marginBottom: '1rem' }}>Add option</button>

      <br />
      <button
        type="button"
        onClick={submit}
        disabled={submitting}
        style={{ marginTop: '1rem', padding: '0.5rem 1.5rem' }}
      >
        {submitting ? 'Creating...' : 'Create'}
      </button>

      {error && <p style={{ color: 'red', marginTop: '0.5rem' }}>{error}</p>}
    </div>
  );
}
```

- [ ] **Step 4: Run test — confirm PASS**

```bash
pnpm nx test @org/wrastlin-game --testFile=src/views/CreateProposition.spec.tsx
```
Expected: PASS — all tests green.

- [ ] **Step 5: Commit**

```bash
git add apps/wrastlin/game/src/views/CreateProposition.tsx \
  apps/wrastlin/game/src/views/CreateProposition.spec.tsx
git commit -m "feat(wrastlin): rewrite CreateProposition for new data model"
```

---

### Task 19: Rewrite PropositionDetail

**Files:**
- Modify: `apps/wrastlin/game/src/views/PropositionDetail.tsx`
- Modify: `apps/wrastlin/game/src/views/PropositionDetail.spec.tsx`

- [ ] **Step 1: Write failing tests**

Replace `apps/wrastlin/game/src/views/PropositionDetail.spec.tsx` with:

```typescript
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { api, ApiError } from '../api/client.js';
import { PropositionDetail } from './PropositionDetail.js';
import type { BetProposition, BetEntry, BettingState, Manager } from '@org/wrastlin-shared';

vi.mock('../api/client.js', () => ({
  api: {
    getBettingState: vi.fn(),
    getProposition: vi.fn(),
    getManager: vi.fn(),
    getAllEntries: vi.fn(),
    placeBet: vi.fn(),
  },
  ApiError: class ApiError extends Error {
    serverMessage: string;
    status: number;
    constructor(msg: string, status: number) {
      super(msg);
      this.serverMessage = msg;
      this.status = status;
    }
  },
}));

const openState: BettingState = { week: 7, phase: 'open', openedAt: '2026-03-28T10:00:00.000Z' };
const closedState: BettingState = { ...openState, phase: 'closed' };

const fixtureProposition: BetProposition = {
  propositionId: 'prop-1',
  week: 7,
  createdBy: 'm-001',
  statement: 'Dazzling Steve will lose to Vern',
  options: [
    { optionId: 'opt-1', label: 'Rex Dominion' },
    { optionId: 'opt-2', label: 'Iron Mike' },
  ],
  createdAt: '2026-03-28T10:00:00.000Z',
};

const resolvedProposition: BetProposition = {
  ...fixtureProposition,
  judgement: {
    winningOptionIds: ['opt-1'],
    rationale: 'Rex won by submission.',
    confidence: 'clear',
  },
  resolvedAt: '2026-03-29T11:00:00.000Z',
};

const fixtureManager: Manager = {
  managerId: 'm-001',
  wrestlerId: 'w-002',
  money: 500,
  trustLevel: 'medium',
};

const allEntries: BetEntry[] = [
  { entryId: 'e-1', propositionId: 'prop-1', bettorId: 'm-001', optionId: 'opt-1', amount: 100, placedAt: '' },
  { entryId: 'e-2', propositionId: 'prop-1', bettorId: 'm-002', optionId: 'opt-2', amount: 50, placedAt: '' },
];

function renderDetail(propId = 'prop-1') {
  return render(
    <MemoryRouter initialEntries={[`/bets/${propId}`]}>
      <Routes>
        <Route path="/bets/:id" element={<PropositionDetail />} />
      </Routes>
    </MemoryRouter>
  );
}

describe('PropositionDetail', () => {
  beforeEach(() => {
    vi.mocked(api.getBettingState).mockResolvedValue(openState);
    vi.mocked(api.getProposition).mockResolvedValue(fixtureProposition);
    vi.mocked(api.getManager).mockResolvedValue(fixtureManager);
    vi.mocked(api.getAllEntries).mockResolvedValue(allEntries);
    vi.mocked(api.placeBet).mockResolvedValue({
      entryId: 'e-new', propositionId: 'prop-1', bettorId: 'm-001',
      optionId: 'opt-1', amount: 25, placedAt: '',
    });
  });

  it('shows loading state initially', () => {
    renderDetail();
    expect(screen.getByText('Loading...')).toBeInTheDocument();
  });

  it('renders proposition statement after load', async () => {
    renderDetail();
    await waitFor(() => {
      expect(screen.getByText('Dazzling Steve will lose to Vern')).toBeInTheDocument();
    });
  });

  it('renders option labels with pool totals from entries', async () => {
    renderDetail();
    await waitFor(() => {
      expect(screen.getByText(/Rex Dominion.*\$100/)).toBeInTheDocument();
      expect(screen.getByText(/Iron Mike.*\$50/)).toBeInTheDocument();
    });
  });

  it('shows manager balance', async () => {
    renderDetail();
    await waitFor(() => {
      expect(screen.getByText(/Balance: \$500/)).toBeInTheDocument();
    });
  });

  it('shows my existing bets', async () => {
    renderDetail();
    await waitFor(() => {
      expect(screen.getByText(/You bet \$100 on Rex Dominion/)).toBeInTheDocument();
    });
  });

  it('does NOT show amount input before an option is clicked', async () => {
    renderDetail();
    await waitFor(() => screen.getByText('Dazzling Steve will lose to Vern'));
    expect(screen.queryByRole('spinbutton')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Place Bet' })).not.toBeInTheDocument();
  });

  it('clicking an option expands its inline bet form', async () => {
    const user = userEvent.setup();
    renderDetail();
    await waitFor(() => screen.getByRole('button', { name: /Rex Dominion/ }));
    await user.click(screen.getByRole('button', { name: /Rex Dominion/ }));
    expect(screen.getByRole('spinbutton')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Place Bet' })).toBeInTheDocument();
  });

  it('clicking the same option again collapses the form', async () => {
    const user = userEvent.setup();
    renderDetail();
    await waitFor(() => screen.getByRole('button', { name: /Rex Dominion/ }));
    await user.click(screen.getByRole('button', { name: /Rex Dominion/ }));
    await user.click(screen.getByRole('button', { name: /Rex Dominion/ }));
    expect(screen.queryByRole('button', { name: 'Place Bet' })).not.toBeInTheDocument();
  });

  it('switching to another option shows only one Place Bet button', async () => {
    const user = userEvent.setup();
    renderDetail();
    await waitFor(() => screen.getByRole('button', { name: /Rex Dominion/ }));
    await user.click(screen.getByRole('button', { name: /Rex Dominion/ }));
    await user.click(screen.getByRole('button', { name: /Iron Mike/ }));
    expect(screen.getAllByRole('button', { name: 'Place Bet' })).toHaveLength(1);
  });

  it('calls placeBet with managerId when submitted', async () => {
    const user = userEvent.setup();
    renderDetail();
    await waitFor(() => screen.getByRole('button', { name: /Rex Dominion/ }));
    await user.click(screen.getByRole('button', { name: /Rex Dominion/ }));
    const amountInput = screen.getByRole('spinbutton');
    await user.clear(amountInput);
    await user.type(amountInput, '75');
    await user.click(screen.getByRole('button', { name: 'Place Bet' }));
    await waitFor(() => {
      expect(vi.mocked(api.placeBet)).toHaveBeenCalledWith('prop-1', {
        managerId: 'm-001',
        optionId: 'opt-1',
        amount: 75,
      });
    });
  });

  it('re-fetches proposition and entries after successful bet', async () => {
    const user = userEvent.setup();
    renderDetail();
    await waitFor(() => screen.getByRole('button', { name: /Rex Dominion/ }));
    await user.click(screen.getByRole('button', { name: /Rex Dominion/ }));
    await user.click(screen.getByRole('button', { name: 'Place Bet' }));
    await waitFor(() => {
      expect(vi.mocked(api.getProposition)).toHaveBeenCalledTimes(2);
      expect(vi.mocked(api.getAllEntries)).toHaveBeenCalledTimes(2);
    });
  });

  it('shows serverMessage on ApiError from placeBet', async () => {
    const { ApiError: Err } = await import('../api/client.js');
    vi.mocked(api.placeBet).mockRejectedValue(new Err('Insufficient funds', 422));
    const user = userEvent.setup();
    renderDetail();
    await waitFor(() => screen.getByRole('button', { name: /Rex Dominion/ }));
    await user.click(screen.getByRole('button', { name: /Rex Dominion/ }));
    await user.click(screen.getByRole('button', { name: 'Place Bet' }));
    await waitFor(() => {
      expect(screen.getByText('Insufficient funds')).toBeInTheDocument();
    });
  });

  it('does NOT show clickable option buttons when phase is not open', async () => {
    vi.mocked(api.getBettingState).mockResolvedValue(closedState);
    renderDetail();
    await waitFor(() => screen.getByText('Dazzling Steve will lose to Vern'));
    expect(screen.queryByRole('button', { name: /Rex Dominion/ })).not.toBeInTheDocument();
  });

  it('shows judge rationale when proposition is resolved', async () => {
    vi.mocked(api.getProposition).mockResolvedValue(resolvedProposition);
    renderDetail();
    await waitFor(() => {
      expect(screen.getByText('Rex won by submission.')).toBeInTheDocument();
    });
  });

  it('highlights winning option when resolved', async () => {
    vi.mocked(api.getProposition).mockResolvedValue(resolvedProposition);
    renderDetail();
    await waitFor(() => {
      expect(screen.getByText(/Rex Dominion.*winner/i)).toBeInTheDocument();
    });
  });

  it('renders error message when initial fetches fail', async () => {
    vi.mocked(api.getProposition).mockRejectedValue(new Error('Server down'));
    renderDetail();
    await waitFor(() => {
      expect(screen.getByText('Error: Server down')).toBeInTheDocument();
    });
  });
});
```

- [ ] **Step 2: Run test — confirm FAIL**

```bash
pnpm nx test @org/wrastlin-game --testFile=src/views/PropositionDetail.spec.tsx
```
Expected: FAIL — old shape and missing methods cause failures.

- [ ] **Step 3: Rewrite PropositionDetail.tsx**

Replace `apps/wrastlin/game/src/views/PropositionDetail.tsx` with:

```typescript
import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { api, ApiError } from '../api/client.js';
import { computePool } from '../utils/pool.js';
import type { BetProposition, BetEntry, BettingState, Manager } from '@org/wrastlin-shared';

const MANAGER_ID = 'm-001';

export function PropositionDetail() {
  const { id } = useParams<{ id: string }>();
  const [proposition, setProposition] = useState<BetProposition | null>(null);
  const [bettingState, setBettingState] = useState<BettingState | null>(null);
  const [manager, setManager] = useState<Manager | null>(null);
  const [allEntries, setAllEntries] = useState<BetEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedOptionId, setExpandedOptionId] = useState<string | null>(null);
  const [amount, setAmount] = useState(1);
  const [betError, setBetError] = useState('');

  async function loadData() {
    try {
      const [prop, state, mgr, entries] = await Promise.all([
        api.getProposition(id!),
        api.getBettingState(),
        api.getManager(MANAGER_ID),
        api.getAllEntries(),
      ]);
      setProposition(prop);
      setBettingState(state);
      setManager(mgr);
      setAllEntries(entries);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { if (id) loadData(); }, []);

  if (!id) return null;
  if (loading) return <p>Loading...</p>;
  if (error) return <p style={{ color: 'red' }}>Error: {error}</p>;
  if (!proposition || !manager) return null;

  const pool = computePool(allEntries, id);
  const myEntries = allEntries.filter(e => e.bettorId === MANAGER_ID && e.propositionId === id);
  const isOpen = bettingState?.phase === 'open';

  function toggleOption(optionId: string) {
    setExpandedOptionId(prev => (prev === optionId ? null : optionId));
    setBetError('');
    setAmount(1);
  }

  async function placeBet() {
    if (!expandedOptionId) return;
    setBetError('');
    try {
      await api.placeBet(id!, { managerId: MANAGER_ID, optionId: expandedOptionId, amount });
      const [prop, entries] = await Promise.all([
        api.getProposition(id!),
        api.getAllEntries(),
      ]);
      setProposition(prop);
      setAllEntries(entries);
      setExpandedOptionId(null);
    } catch (e) {
      setBetError(e instanceof ApiError ? e.serverMessage : (e as Error).message);
    }
  }

  return (
    <div style={{ padding: '1rem', maxWidth: '600px' }}>
      <h2>{proposition.statement}</h2>
      <p>Balance: ${manager.money}</p>

      {myEntries.map(entry => {
        const opt = proposition.options.find(o => o.optionId === entry.optionId);
        return (
          <p key={entry.entryId}>
            You bet ${entry.amount} on {opt?.label ?? entry.optionId}
          </p>
        );
      })}

      <h3>Options</h3>
      <ul style={{ listStyle: 'none', padding: 0 }}>
        {proposition.options.map(opt => {
          const isWinner = proposition.judgement?.winningOptionIds.includes(opt.optionId);
          const isExpanded = expandedOptionId === opt.optionId;
          const label = `${opt.label}${isWinner ? ' (winner)' : ''} — $${pool.byOption[opt.optionId] ?? 0} in pool`;
          return (
            <li key={opt.optionId} style={{ marginBottom: '0.5rem' }}>
              {isOpen ? (
                <button
                  type="button"
                  onClick={() => toggleOption(opt.optionId)}
                  style={{ textAlign: 'left', background: 'none', border: '1px solid #ccc', cursor: 'pointer', padding: '0.25rem 0.5rem', width: '100%' }}
                >
                  {label}
                </button>
              ) : (
                <span>{label}</span>
              )}
              {isExpanded && (
                <div style={{ marginTop: '0.25rem', paddingLeft: '0.5rem' }}>
                  <label htmlFor={`amount-${opt.optionId}`}>Amount: $</label>
                  <input
                    id={`amount-${opt.optionId}`}
                    type="number"
                    min={1}
                    step={1}
                    value={amount}
                    onChange={e => setAmount(parseInt(e.target.value, 10))}
                  />
                  <button type="button" onClick={placeBet} style={{ marginLeft: '0.5rem' }}>
                    Place Bet
                  </button>
                  {betError && <p style={{ color: 'red', marginTop: '0.25rem' }}>{betError}</p>}
                </div>
              )}
            </li>
          );
        })}
      </ul>

      {proposition.judgement && (
        <div style={{ marginTop: '1rem', padding: '0.5rem', background: '#f9f9f9' }}>
          <strong>Judge's ruling:</strong>
          <p style={{ margin: '0.25rem 0', fontStyle: 'italic' }}>{proposition.judgement.rationale}</p>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Run test — confirm PASS**

```bash
pnpm nx test @org/wrastlin-game --testFile=src/views/PropositionDetail.spec.tsx
```
Expected: PASS — all tests green.

- [ ] **Step 5: Run full game test suite**

```bash
pnpm nx test @org/wrastlin-game
```
Expected: PASS — all tests green across all specs.

- [ ] **Step 6: Commit**

```bash
git add apps/wrastlin/game/src/views/PropositionDetail.tsx \
  apps/wrastlin/game/src/views/PropositionDetail.spec.tsx
git commit -m "feat(wrastlin): rewrite PropositionDetail with inline bet form and judgement display"
```

---

## Self-Review

**Spec coverage:**
- ✓ Free-form proposition with `statement` + dynamic options — Task 18
- ✓ Pool totals + per-option amounts on list — Task 17
- ✓ Click option → expand inline bet form — Task 19
- ✓ Create Proposition button only when `open` — Task 17
- ✓ Results view: personal P&L, stake→payout, full proposition list — Task 16
- ✓ Winning option highlighted — Tasks 16 + 19
- ✓ Judge rationale visible — Tasks 16 + 19
- ✓ Manual review badge for ambiguous propositions — Task 16
- ✓ Phase from global state (not per-proposition) — Tasks 13 + 15 + 17 + 19
- ✓ `managerId` (not `bettorId`) in placeBet body — Tasks 15 + 19
- ✓ No `closesAt`, `eventKey`, `status` fields — Tasks 15 + 18

**Type consistency:**
- `BetProposition.statement` used throughout ✓
- `computePool(entries, propositionId)` → `{ byOption, total }` consistent across Tasks 14, 16, 17, 19 ✓
- `api.placeBet(id, { managerId, optionId, amount })` matches client definition ✓
- `api.createProposition({ managerId, statement, options: { label }[] })` matches client ✓
- `MANAGER_ID = 'm-001'` hardcoded consistently in BettingList, CreateProposition, PropositionDetail ✓
