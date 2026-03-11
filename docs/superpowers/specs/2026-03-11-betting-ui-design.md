# Betting UI Design

**Date:** 2026-03-11
**Status:** Approved

---

## Overview

A React UI for the wrastlin betting system. Managers can browse all propositions, create new ones, and place integer-amount bets on open propositions. Builds on the existing betting backend (`@org/betting` + wrastlin-service routes) and the existing React client (`apps/wrastlin/game`).

---

## Routes & Navigation

Three new React Router routes added to `App.tsx`. A "Bets" link added to the nav bar alongside "My Wrestler" and "Weekly Submission".

| Route | Component | Purpose |
|-------|-----------|---------|
| `/bets` | `BettingList` | List all propositions, link to create |
| `/bets/new` | `CreateProposition` | Form to create a new proposition |
| `/bets/:id` | `PropositionDetail` | Pool breakdown + place-bet form |

---

## Views

### `BettingList` (`/bets`)

- On mount: fetch `GET /bets/propositions` (all propositions)
- Renders each proposition as a row: question, status badge (`open`/`closed`/`resolved`), `closesAt` date
- Each row is a link to `/bets/:id`
- "Create Proposition" button navigates to `/bets/new`

### `CreateProposition` (`/bets/new`)

- Fields:
  - Question (text input)
  - Closes At (datetime-local input)
  - Event Key (text input — week number or identifier)
  - Options list — dynamic, starts with 2 rows, add/remove buttons; each row is a label text input; `optionId` auto-generated on submit as `opt-1`, `opt-2`, etc.
- Submit → `POST /bets/propositions` with `createdBy: 'm-001'`
- On success → navigate to `/bets/:id` for the newly created proposition

### `PropositionDetail` (`/bets/:id`)

- On mount: fetch `GET /bets/propositions/:id` (returns proposition + pool), `GET /managers/m-001` (money balance), `GET /bets/entries?bettorId=m-001` (manager's existing entries on this proposition)
- Shows: question, status, `closesAt`, each option with its pool total
- Shows manager's current balance above the bet form
- If status is `open`: bet form — radio buttons for each option, integer amount input (min 1), submit button → `POST /bets/propositions/:id/entries`
- After placing a bet: re-fetches proposition + entries to refresh pool totals
- If status is `closed` or `resolved`: no bet form shown

---

## API Client Additions

New methods added to `apps/wrastlin/game/src/api/client.ts`:

```typescript
getPropositions: (status?: string) =>
  get<(BetProposition & { pool: BetPool })[]>(
    status ? `/bets/propositions?status=${status}` : '/bets/propositions'
  ),
getProposition: (id: string) =>
  get<BetProposition & { pool: BetPool }>(`/bets/propositions/${id}`),
createProposition: (body: CreatePropositionBody) =>
  post<BetProposition>('/bets/propositions', body),
placeBet: (propositionId: string, body: PlaceEntryBody) =>
  post<BetEntry>(`/bets/propositions/${propositionId}/entries`, body),
getMyEntries: (bettorId: string) =>
  get<BetEntry[]>(`/bets/entries?bettorId=${bettorId}`),
```

Types `BetProposition`, `BetPool`, and `BetEntry` imported from `@org/betting`. `CreatePropositionBody` and `PlaceEntryBody` defined inline in `client.ts`.

---

## New Files

| File | Purpose |
|------|---------|
| `apps/wrastlin/game/src/views/BettingList.tsx` | Proposition list view |
| `apps/wrastlin/game/src/views/BettingList.spec.tsx` | RTL tests for BettingList |
| `apps/wrastlin/game/src/views/CreateProposition.tsx` | Create proposition form view |
| `apps/wrastlin/game/src/views/CreateProposition.spec.tsx` | RTL tests for CreateProposition |
| `apps/wrastlin/game/src/views/PropositionDetail.tsx` | Detail + bet form view |
| `apps/wrastlin/game/src/views/PropositionDetail.spec.tsx` | RTL tests for PropositionDetail |

---

## Modified Files

| File | Change |
|------|--------|
| `apps/wrastlin/game/src/App.tsx` | Add `/bets`, `/bets/new`, `/bets/:id` routes + nav link |
| `apps/wrastlin/game/src/api/client.ts` | Add 5 new betting API methods |

---

## Testing

Tests use vitest + React Testing Library. The `api` client module is mocked via `vi.mock('../api/client.js')`. Tests are written before implementation (TDD).

| File | Coverage |
|------|----------|
| `BettingList.spec.tsx` | Renders list from mocked `getPropositions`; status badges; "Create Proposition" navigates to `/bets/new`; proposition row links to `/bets/:id` |
| `CreateProposition.spec.tsx` | Renders form; add/remove option rows; submit calls `createProposition` with correct shape; navigates to detail on success |
| `PropositionDetail.spec.tsx` | Renders question + pool totals per option; shows manager balance; renders bet form when `open`; submit calls `placeBet`; re-fetches after bet; hides bet form when `closed`/`resolved` |

---

## Deferred

- Filtering propositions by status in the list view
- Showing all of a manager's entries across all propositions
- Admin resolve UI (currently admin-only via `POST /bets/propositions/:id/resolve`, no UI planned)
- Odds display (e.g. implied probability from pool totals)
