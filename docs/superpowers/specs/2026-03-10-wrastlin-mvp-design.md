# Wrastlin MVP Design

**Date:** 2026-03-10
**Status:** Approved

## Overview

A legacy-style social wrestling management game. Players are managers, not wrestlers. Core loop: interact with your wrestler during the week → submit guidance + story requests → show generation job runs → results published. AI handles wrestler personality and narration; all match outcomes are deterministic.

## Milestones

| # | Milestone | Manual Test |
|---|-----------|-------------|
| 0 | Project Scaffolding | `pnpm nx build` passes for all wrastlin packages |
| 1 | Core Types + Seed Data | Script loads wrestlers from JSON, prints them |
| 2 | Game Server API | `curl` wrestler info + mock chat response |
| 3 | Submission API | `curl` to submit weekly form, read it back |
| 4 | Manager UI | Browser: view wrestler, chat (mock), submit weekly form |
| 5 | Match Resolver + Storyteller | Script: wrestlers in → show card + results out |
| 6 | Show Generation CLI | `pnpm nx run wrastlin-service:generate-show` → formatted show |

**Deferred:** AI integration, show viewer UI, betting system.

## Architecture

### Game Server
- Package: `@org/wrastlin-meta-service` (`apps/wrastlin/meta-service`)
- Fastify v5, CJS/esbuild build, same pattern as `dungeon-service`
- Port: TBD (likely 3002)
- Handles: wrestler state, manager interactions, submissions, weekly orchestration

### Manager UI
- Package: `@org/wrastlin-game` (`apps/wrastlin/game`)
- React 18 + Vite, same pattern as `@org/game`
- Two views: wrestler dashboard (chat + stats), weekly submission form

### Shared Types
- Package: `@org/wrastlin-shared` (`libs/wrastlin/shared`)
- All TypeScript interfaces imported via path alias in both server and client

### Show Generation
- NX target `generate-show` on `wrastlin-service`
- Runs as a Node script against data files
- Manually triggered after submissions close — not an HTTP endpoint

### Persistence
- JSON flat files in `apps/wrastlin/meta-service/data/` for MVP
- Files: `wrestlers.json`, `managers.json`, `state.json`, `submissions/week-N.json`, `shows/week-N.json`

## Project Structure (meta-service)

```
apps/wrastlin/meta-service/
  src/
    core/        ← weekly orchestrator, game state loader
    wrestlers/   ← wrestler state, decision engine, memory system
    managers/    ← manager service
    storyteller/ ← show generator, segment resolver, match resolver
    api/         ← Fastify routes
    data/        ← JSON file read/write utilities
  scripts/
    generate-show.ts
  data/
    wrestlers.json
    managers.json
    state.json
    submissions/
    shows/
```

## Data Model

### Wrestler
```typescript
{
  wrestlerId: string         // uuid
  name: string
  gimmick: string
  stats: {
    strength: number         // 1-100
    agility: number
    endurance: number
    charisma: number
  }
  personality: {
    ego: number              // 1-10
    anger: number
    honor: number
    loyalty: number
    ambition: number
  }
  emotionalState: {
    confidence: number       // 1-10, changes week to week
    frustration: number
    fatigue: number
  }
  relationships: Array<{
    wrestlerId: string
    hatred: number           // 1-10
    respect: number
    trust: number
  }>
  memories: Memory[]
  managerTrust: number       // 1-10
}
```

### Memory
```typescript
{
  memoryId: string
  type: 'humiliation' | 'betrayal' | 'victory' | 'injury' | 'promo'
  source: string             // wrestlerId or 'manager'
  target: string
  week: number
  intensity: number          // 1-10
}
```

### Manager
```typescript
{
  managerId: string
  wrestlerId: string
  money: number
  trustLevel: 'low' | 'medium' | 'high'
}
```

### Weekly Submission
```typescript
{
  managerId: string
  week: number
  advice: {
    matchStyle: 'technical' | 'brawl' | 'high-fly' | 'heel' | 'face'
    targetOpponent?: string  // wrestlerId
  }
  storyRequests: Array<{
    type: 'push' | 'feud' | 'betrayal' | 'title-shot' | 'promo'
    target?: string
    bribeAmount: number
  }>
}
```

### Weekly State Machine
```
week_open → submissions_closed → show_generated → week_open (next week)
```
Stored in `data/state.json`. Transition `submissions_closed → show_generated` is triggered by running the CLI script manually.

### Show Output
```typescript
{
  week: number
  segments: Segment[]
  matches: MatchResult[]
  crowdReaction: 'hot' | 'lukewarm' | 'dead'
  narration: string          // template-based for MVP
}
```

## Match Resolution

Deterministic — no AI involved.

Inputs: two wrestlers + their emotional states + manager advice + rivalry heat
Output: winner, finishType, crowdReaction, moments[]

Finish types: `clean` | `dirty` | `interference` | `count-out` | `dq` | `no-contest`

Resolution formula considers: stat differential, momentum (confidence), manager guidance weight (scaled by managerTrust), rivalry heat modifier, anger/cheating tendency.

## Show Generation Pipeline

1. Load world state (wrestlers, managers, submissions, rivalries)
2. Calculate story pressure (heat levels, pending feuds, title picture)
3. Generate segment candidates from submissions + organic story pressure
4. Assemble show card (opening promo → mid-card → main event)
5. Resolve each segment using match resolver
6. Generate narration text (template strings for MVP, AI later)
7. Update world state (emotions, memories, relationships, managerTrust)
8. Save show to `data/shows/week-N.json`

## Wrestler Chat (Milestone 2-4)

Mock responses for MVP — canned response variants keyed by personality archetype (high-ego, honorable, coward, etc.) and emotional state. Real Claude API integration deferred to a later milestone.

Manager chat influences: emotional state adjustments, managerTrust delta, match style preference for the week.

## Deferred

- **AI integration**: Claude API for real wrestler dialogue + narration
- **Show viewer UI**: format TBD
- **Betting system**: pools, odds, payouts
- **Auth/login**: single-player for now, no auth needed
- **E2E tests**: scaffold exists, populate after UI milestones
