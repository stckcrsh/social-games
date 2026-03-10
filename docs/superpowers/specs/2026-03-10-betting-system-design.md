# Betting System Design

**Date:** 2026-03-10
**Status:** Approved

---

## Overview

A cross-game betting system where players propose wagers on in-game events, other players place bets, and payouts are calculated asynchronously after outcomes are determined. Designed to live in `libs/shared/betting` as a pure shared library consumed by each game's server.

---

## Architecture

**Option chosen:** Shared core lib + game-owned routes.

- `libs/shared/betting` (`@org/betting`) — all game-agnostic logic: types, pool math, payout strategies, proposition validation
- Each game server (e.g., `apps/wrastlin/meta-service`) owns HTTP routes, persistence, and the resolution trigger
- No standalone betting service; follows the existing `@org/shared` / `@org/wrastlin-shared` pattern

`libs/shared/betting` is the first real occupant of `libs/shared/`. Two workspace config changes are required:

1. Add `'libs/shared/*'` to `pnpm-workspace.yaml`
2. Add `"@org/betting": ["./libs/shared/betting/src/index.ts"]` to `paths` in `tsconfig.base.json`
3. Add `./libs/shared/betting` to the `references` array in root `tsconfig.json`

---

## Core Concepts

### BetProposition
A question proposed by a manager/player, with named options and a lifecycle state.

```typescript
export type PropositionStatus = 'open' | 'closed' | 'resolved';

export interface BetOption {
  optionId: string;
  label: string; // e.g. "Rex Dominion"
}

export interface BetProposition {
  propositionId: string;
  createdBy: string;           // managerId / playerId
  question: string;            // "Who will win match 2?"
  options: BetOption[];
  status: PropositionStatus;
  closesAt: string;            // ISO — hard per-proposition deadline set by creator
  eventKey: string | number;   // week number or game-specific event identifier
  createdAt: string;
  resolvedAt?: string;
  winningOptionIds?: string[];
}
```

Note: there is no `gamePhaseDeadline` field on the proposition. The game-phase outer limit is enforced by passing the live game phase into `isPropositionAcceptingBets` — not by storing a timestamp. This keeps the type simple and avoids staleness.

### BetEntry
One player's wager on a single option.

```typescript
export interface BetEntry {
  entryId: string;
  propositionId: string;
  bettorId: string;   // managerId
  optionId: string;
  amount: number;
  placedAt: string;
}
```

### BetPool
Derived from entries at runtime — never stored. The caller always knows the `propositionId`, so it is not included.

```typescript
export interface BetPool {
  totalPot: number;
  byOption: Record<string, number>; // optionId → total wagered
}
```

### BetPayout
Output of resolution for a single bettor. `amount` is the **total to credit** — it includes the bettor's original stake (i.e., parimutuel share of the full pot, not just profit). The route handler must not additionally refund the original stake.

```typescript
export interface BetPayout {
  bettorId: string;
  entryId: string;
  amount: number;
}
```

---

## Shared Lib (`@org/betting`)

**Location:** `libs/shared/betting/src/`

Pure functions and types only — no file I/O, no HTTP, no game-specific state.

### Payout Strategy (modular)

Payout calculation is pluggable via a `PayoutStrategy` interface. Parimutuel ships as the default. Adding a new payout model is just implementing `PayoutStrategy` and passing it in — no changes to core logic.

```typescript
export interface PayoutStrategy {
  calculate(pool: BetPool, entries: BetEntry[], winningOptionIds: string[]): BetPayout[];
}

export const parimutuelStrategy: PayoutStrategy = {
  calculate(pool, entries, winningOptionIds) {
    // Each winner's total credit = (their stake / total staked on winning options) × totalPot
    // Losers receive nothing; their money was deducted at entry time
  }
};

export function calculatePayouts(
  pool: BetPool,
  entries: BetEntry[],
  winningOptionIds: string[],
  strategy: PayoutStrategy = parimutuelStrategy
): BetPayout[]
```

### Other Exports

- **`buildPool(entries: BetEntry[]): BetPool`** — derives pool totals from a homogeneous list of entries (all for the same proposition). Returns `{ totalPot: 0, byOption: {} }` for empty input.
- **`isPropositionAcceptingBets(proposition: BetProposition, now: string, gamePhase: string): boolean`** — returns false if `closesAt` has passed, the game phase is not `'week_open'`, or status is not `'open'`.

---

## Game Server Integration (wrastlin-service)

### New Files

```
apps/wrastlin/meta-service/src/
  bets/
    betService.ts        # persistence + money helpers
  api/
    bets.ts              # Fastify route plugin
    bets.spec.ts         # route integration tests

apps/wrastlin/meta-service/data/bets/
  propositions.json
  entries.json
```

### Routes

| Method | Path | Caller | Description |
|--------|------|--------|-------------|
| `POST` | `/bets/propositions` | Manager | Create a proposition; validates phase is `week_open` and manager exists |
| `GET` | `/bets/propositions` | Manager | List propositions; filterable by `status` query param |
| `GET` | `/bets/propositions/:id` | Manager | Get proposition + pool summary |
| `POST` | `/bets/propositions/:id/entries` | Manager | Place a bet; validates window and funds, then persists entry and deducts money |
| `GET` | `/bets/entries?bettorId=:id` | Manager | List all entries placed by a given bettor |
| `POST` | `/bets/propositions/:id/resolve` | Admin | Supply winning option IDs; calculates and distributes payouts |

Any manager can create a proposition. The server validates only that the manager exists (same guard pattern as `POST /submissions`).

### Submission Window

Two levels of deadline enforcement handled entirely in `isPropositionAcceptingBets`:

1. **Per-proposition `closesAt`** — hard deadline set by the proposition creator
2. **Game phase outer limit** — bets are rejected whenever the game phase is not `week_open`

There is no separate `POST /bets/close-phase` route. When the admin calls `POST /state/close-submissions`, the existing wrastlin state route transitions the phase to `submissions_closed`. Subsequent calls to `POST /bets/propositions/:id/entries` will fail via `isPropositionAcceptingBets` because the phase is no longer `week_open`. No separate action is needed.

### Money Flow and Ordering

**Entry placed — write order matters:**

1. Validate sufficient funds (`manager.money >= amount`)
2. **Write entry to `entries.json` first**
3. Deduct from `manager.money` in `managers.json` second

If the server crashes between steps 2 and 3, the entry exists but money was not deducted. This is safer than the reverse (money gone, no entry). Recovery: on startup, the server can reconcile entries against manager balances (future task; noted as a known MVP limitation).

**Concurrency limitation:** The existing `loadManagers`/`saveManagers` pattern is a synchronous read-then-write with no locking. Simultaneous bets from the same manager could cause an overdraw. MVP mitigation: document this as a known limitation acceptable for a single-server, low-concurrency game. A future task can add a per-manager in-memory lock if needed.

**Resolution — winner:** `manager.money += payout.amount` (full parimutuel share, includes original stake)
**Resolution — loser:** no action (money already deducted at entry)

---

## Resolution Flow

1. Outcome is determined (manually by admin for MVP; AI validator in a future task)
2. Admin calls `POST /bets/propositions/:id/resolve` with `{ winningOptionIds: string[] }`
3. Route loads all entries for that proposition, calls `buildPool(entries)`, then `calculatePayouts(pool, entries, winningOptionIds)`
4. For each payout, `creditMoney(bettorId, payout.amount)` updates `managers.json`
5. Proposition status → `resolved`, `resolvedAt` set
6. Attempting to resolve an already-resolved proposition returns 400

---

## Testing Strategy

**Shared lib (`@org/betting`):**
- Unit tests, no mocks — pure functions
- `calculatePayouts`: single winner, split pot (multiple options both win), all losers, custom `PayoutStrategy`
- `isPropositionAcceptingBets`: `closesAt` expired, phase not `week_open`, status `closed`, status `resolved`, all clear → true
- `buildPool`: empty entries, single bettor, multiple options

**Route tests (`bets.spec.ts`):**
- Follow `app.inject()` + `vi.spyOn(betService, ...)` pattern established in wrastlin-service
- Happy path: create proposition, place bet (verify entry written + money deducted), view entries by bettor, resolve
- Guards: bet on closed proposition, insufficient funds, resolve already-resolved proposition, create proposition outside `week_open`

---

## Deferred

- AI-driven automatic resolution for wrastlin (manual admin resolve for MVP)
- Horse racing bet types (win/place/show, trifectas) — future racing game
- Spectator role (non-player bettors)
- House cut / rake
- Bet cancellation
- Startup reconciliation of entries vs. manager balances
- Per-manager concurrency lock

---

## File Map

| Path | Package | Contents |
|------|---------|----------|
| `pnpm-workspace.yaml` | — | Add `'libs/shared/*'` glob |
| `tsconfig.base.json` | — | Add `"@org/betting": ["./libs/shared/betting/src/index.ts"]` to `paths` |
| `tsconfig.json` (root) | — | Add `./libs/shared/betting` to `references` |
| `libs/shared/betting/src/types.ts` | `@org/betting` | All betting types |
| `libs/shared/betting/src/pool.ts` | `@org/betting` | `buildPool` |
| `libs/shared/betting/src/payouts.ts` | `@org/betting` | `PayoutStrategy`, `parimutuelStrategy`, `calculatePayouts` |
| `libs/shared/betting/src/validation.ts` | `@org/betting` | `isPropositionAcceptingBets` |
| `libs/shared/betting/src/index.ts` | `@org/betting` | Re-exports all of the above |
| `libs/shared/betting/package.json` | — | `{ name: "@org/betting", version: "0.0.0", private: true }` |
| `libs/shared/betting/tsconfig.json` | — | Root tsconfig: `files: []`, references `tsconfig.lib.json` |
| `libs/shared/betting/tsconfig.lib.json` | — | Compilation config: extends root, `composite: true`, `emitDeclarationOnly: true` |
| `libs/shared/betting/project.json` | — | NX project (lint target, NX project name: `betting`) |
| `apps/wrastlin/meta-service/vitest.config.mts` | wrastlin-service | Add `'@org/betting'` alias (mirrors existing `@org/wrastlin-shared` alias pattern) |
| `apps/wrastlin/meta-service/src/bets/betService.ts` | wrastlin-service | Persistence + money helpers |
| `apps/wrastlin/meta-service/src/api/bets.ts` | wrastlin-service | Fastify route plugin |
| `apps/wrastlin/meta-service/src/api/bets.spec.ts` | wrastlin-service | Route integration tests |
| `apps/wrastlin/meta-service/data/bets/propositions.json` | wrastlin-service | Proposition data (initial: `[]`) |
| `apps/wrastlin/meta-service/data/bets/entries.json` | wrastlin-service | Entry data (initial: `[]`) |
