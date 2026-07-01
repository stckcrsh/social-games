# Betting

Players create propositions and place bets in real time during the live
show. This is the section explicitly targeted to become a **shared library**
future social games can reuse — not just a Wrastlin feature.

## Status: Built (as a Wrastlin feature)

- `POST /bets/propositions` — statement + options
- `POST /bets/propositions/:id/entries` — place a bet (managerId, optionId, amount)
- `GET /bets/propositions`, `GET /bets/entries`, `GET /bets/state`
- Betting window state machine: `open → closed → settled`
- Frontend: proposition list, create form, detail view with per-option pool totals, real-time pool updates
- Types (`BetOption`, `BetProposition`, `BetEntry`, `BettingPhase`, `BettingState`) live in `libs/wrastlin/shared/src/types/betting.ts`

**Good news for extraction:** the types are already fairly game-agnostic —
`statement` is free text, `createdBy`/`bettorId` are opaque manager IDs,
nothing references wrestlers, matches, or any Wrastlin-specific concept
directly. The `judgement` field on `BetProposition` (winning option IDs +
rationale + confidence) is also generic — the AI judge reads whatever show
data it's given, it doesn't require a wrestling show specifically.

**The extraction target already exists as an empty placeholder:**
`libs/shared/betting/` — currently just an empty directory (confirmed
2026-07). This is where the shared library should land.

## Requirements / FRD ticket

- [ ] **Write the requirements doc for betting-as-a-library.** This is the
  one that needs the most thought before touching code. Questions to
  resolve:
  - What's the actual reusable surface? Propositions + entries + pool
    math + window state machine, almost certainly. Is the AI judge part
    of the library too, or does each game bring its own judge (since
    "read the show and rule on outcomes" is inherently game-specific
    content, even if the judging *mechanism* — read structured data,
    return winning option IDs + rationale + confidence — is generic)?
  - Does the library own money/balance mutation, or does it emit payout
    instructions and let each game apply them to its own currency model?
    (Wrastlin's payouts currently write directly to `managers.json`.)
  - Naming: `managerId`/`bettorId` are Wrastlin-flavored names for what's
    really just "player ID" — decide the library's vocabulary before
    extracting, so Wrastlin doesn't need a second rename later.
  - Does the library assume one betting window per week, or something
    more general (multiple concurrent windows, no fixed weekly cadence)?
    Depends on what the next social game's structure looks like.
  - Storage: Wrastlin's current implementation shape (file-based?
    request-scoped?) needs to be checked against whether the library
    should be storage-agnostic (accept a persistence adapter) or ship
    with its own default storage.

## Remaining tickets (Wrastlin-side, pre-extraction)

- [ ] **Highlight winning option on resolved propositions** — currently no
  visual indication of who won
- [ ] **Show payout on resolution** — display what the manager won/lost
  rather than silently updating balance
- [ ] **Require at least 2 options** — front-end validation gap

## Remaining tickets (library extraction, after requirements doc)

- [ ] **Move/generalize types into `libs/shared/betting`** — starting point
  is `libs/wrastlin/shared/src/types/betting.ts`, which is already close to
  generic
- [ ] **Move the betting service logic out of `apps/wrastlin/meta-service`**
  into the shared lib, behind whatever interface the requirements doc lands on
- [ ] **Wire Wrastlin to consume the shared lib** instead of its own
  in-tree implementation, without changing player-facing behavior
- [ ] **Document the library** — once it exists, it needs its own
  `libs/shared/betting/CLAUDE.md` or README so the next game can use it
  without re-deriving how it works
