# Wrastlin Betting System — Design Spec

**Date:** 2026-03-28
**Status:** Approved

---

## Overview

A friend-group betting system for Wrastlin where players craft propositions (statements with options) and wager on outcomes. An LLM judge resolves bets after each show using the generated show output. The system is isolated from the rest of the game — it does not directly mutate manager money except via explicit admin steps.

---

## Scope

Replaces all existing betting scaffolding (`libs/shared/betting/`, `apps/wrastlin/meta-service/src/api/bets.ts`, `apps/wrastlin/meta-service/src/bets/betService.ts`). Clean redesign.

---

## State Machine

Betting runs as a **parallel state machine** alongside the weekly phase cycle. State lives in `data/runtime/betting/state.json`, separate from `data/runtime/state.json`.

```
idle → open → closed → settled → idle
```

| Phase | What's allowed |
|-------|---------------|
| `idle` | No betting activity for this week |
| `open` | Players create propositions AND place bets on existing propositions simultaneously |
| `closed` | Window shut; `run-judge` can be executed; `resolve-proposition` available for flagged bets |
| `settled` | All payouts applied; week complete |

Transitions are admin-driven (manual NX targets). There is no automatic transition — the admin opens and closes the window when the group is available.

```ts
interface BettingState {
  week: number
  phase: 'idle' | 'open' | 'closed' | 'settled'
  openedAt?: string    // ISO
  closedAt?: string    // ISO
  settledAt?: string   // ISO
}
```

---

## Data Model

### BetProposition

Created by any manager during `open`. Free-form — no templates or constraints beyond a minimum of 2 options.

```ts
interface BetProposition {
  propositionId: string
  week: number
  createdBy: string           // managerId
  statement: string           // e.g. "Dazzling Steve will lose to Vern the Destroyer"
  options: BetOption[]        // { optionId: string, label: string }
  createdAt: string
  judgement?: {
    winningOptionIds: string[]
    rationale: string
    confidence: 'clear' | 'ambiguous'
  }
  resolvedAt?: string
}
```

### BetEntry

Placed by any manager during `open` on any proposition. The wager amount is **deducted from manager balance immediately** on placement. Managers cannot bet more than their current balance.

```ts
interface BetEntry {
  entryId: string
  propositionId: string
  bettorId: string     // managerId
  optionId: string
  amount: number       // deducted from manager balance at placement time
  placedAt: string
}
```

### Escrow

Escrow is **derived** — computed on demand as the sum of all entry amounts for unresolved propositions. No explicit escrow balance is stored (avoids sync issues).

### Payout Model

Parimutuel: winners split the total proposition pool proportionally to their stake.

```
winnerShare = (entryAmount / totalStakedOnWinningOption) * totalPool
```

The full payout (including original stake) is credited via `PendingPayout` ticket.

If no entries exist on the winning option (everyone bet wrong), the pool is refunded — each bettor gets their original stake back. This is written as individual `payout_calculated` events equal to each entry's original amount.

### PendingPayout (JSONL event)

Not stored as a separate file. Written as a `payout_calculated` event in the week's JSONL run log. Applied by the `apply-payouts` step.

---

## Persistence

```
data/runtime/betting/
  state.json                  ← BettingState
  propositions.json           ← BetProposition[]
  entries.json                ← BetEntry[]
  week-{N}.jsonl              ← Judge/payout run log (one per week)
```

---

## JSONL Event Log

Judge and payout runs use the same outbox/JSONL pattern as show generation. File: `data/runtime/betting/week-{N}.jsonl`.

| Event | Fields |
|-------|--------|
| `judge_started` | `week`, `runId` |
| `judgement_completed` | `propositionId`, `winningOptionIds`, `rationale`, `confidence` |
| `judgement_flagged` | `propositionId`, `reason` (ambiguous, needs human review) |
| `payout_calculated` | `propositionId`, `payouts: [{bettorId, entryId, amount}]` |
| `payout_applied` | `bettorId`, `entryId`, `amount` |
| `run_completed` | `week`, `totalPaid` |

**Idempotency:**
- `run-judge` skips propositions that already have a `judgement_completed` event
- `apply-payouts` skips entries that already have a `payout_applied` event
- Both can be safely re-run after a crash

---

## Admin Controls (NX Targets)

All under `pnpm nx run wrastlin-service:<target>`.

| Target | Transition | What it does |
|--------|-----------|--------------|
| `open-betting` | `idle → open` | Opens the window for current week |
| `close-betting` | `open → closed` | Closes the window |
| `run-judge` | (within `closed`) | LLM judges all propositions in parallel; writes JSONL events; prints summary of ambiguous flags |
| `resolve-proposition` | (within `closed`) | Manually set winner on a flagged proposition: `--id <propositionId> --winning-option <optionId>` |
| `apply-payouts` | `closed → settled` | Reads `payout_calculated` events, credits manager balances, writes `payout_applied` events |

### Judge Flow

```
run-judge
  ↓
For each unresolved proposition (parallel):
  Feed [proposition statement + options + full show output] → LLM
  LLM returns { winningOptionIds, rationale, confidence: 'clear' | 'ambiguous' }
  Write judgement_completed or judgement_flagged to JSONL
  For clear judgements: compute parimutuel payouts → write payout_calculated
  ↓
Print summary: "X resolved, Y need manual review: [ids]"
```

### Human Review Loop

```bash
pnpm nx run wrastlin-service:run-judge
# "2 propositions need manual review: prop-003, prop-007"

pnpm nx run wrastlin-service:resolve-proposition -- --id prop-003 --winning-option opt-b
# Writes judgement_completed + payout_calculated for that proposition

pnpm nx run wrastlin-service:apply-payouts
# Credits all pending payouts, transitions to settled
```

### Guard Conditions

- `open-betting` requires weekly phase = `show_generated` (lineup must be set before betting opens)
- `run-judge` requires weekly phase = `show_generated` AND betting phase = `closed`
- `apply-payouts` requires all propositions resolved (no pending `judgement_flagged` without a corresponding `judgement_completed`)
- `place-bet` (API) validates manager has sufficient balance before deducting

---

## API Endpoints

All endpoints enforce the current betting phase.

| Method | Path | Phase required | Description |
|--------|------|---------------|-------------|
| `POST` | `/bets/propositions` | `open` | Create proposition |
| `GET` | `/bets/propositions` | any | List propositions for current week |
| `POST` | `/bets/propositions/:id/entries` | `open` | Place a bet (deducts balance) |
| `GET` | `/bets/entries?bettorId=` | any | List entries for a manager |

---

## UX Interactions

### Crafting a Proposition (during `open`)

Free-form form with:
- Text input for the statement
- Dynamic option list: each option is a text field with a delete button
- "Add option" button
- No minimum/maximum enforced by the UI (kept simple for friends)
- Submit creates the proposition immediately; visible to all players

### Placing a Bet (during `open`)

List view showing all propositions for the week:
- Each proposition shows its statement, pool total, and per-option wagered amounts
- Click an option to expand an inline bet form with an amount input
- Submitting deducts from manager balance immediately
- Pool sizes update live so players can see where the money is going

### Results View (after `settled`)

Player-first layout:
- **Top section**: personal results — net profit/loss, win/loss count, each bet with stake → payout
- **Below**: full proposition list with outcomes, winning option highlighted, judge rationale visible

Ambiguous/pending propositions shown with a warning badge until manually resolved.

---

## What This System Does NOT Do

- No self-bet restriction (players can bet on their own propositions — acceptable for friends game)
- No catch-all "none of the above" option enforced — kept free-form; admin resolves edge cases manually
- No per-proposition window control — one global admin-driven window per week
- No real-time websocket updates — page refresh to see updated pools
- No restriction on multiple entries per proposition — a manager can place multiple bets on the same proposition across different options (or add to an existing option position)

---

## Key Design Decisions & Rationale

| Decision | Rationale |
|----------|-----------|
| Parallel state machine (not integrated phases) | Keeps betting isolated; weekly cycle runs regardless of betting state |
| Derived escrow (not stored) | Avoids a second source of truth that can drift out of sync with entries |
| JSONL outbox for judge + payout | Idempotent re-runs; same proven pattern as show generation |
| PendingPayouts as JSONL events, not a file | One source of truth; no separate file to get out of sync |
| Parimutuel payouts | Self-balancing, no house edge needed, already familiar from scaffolding |
| Free-form propositions, no catch-all | Small friend group; admin resolves edge cases; over-engineering for scale that doesn't exist |
| Manual admin windows | Group plays together; timing based on availability, not timestamps |
