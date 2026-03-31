# Narrative RAG — Data Model Design

**Date:** 2026-03-31  
**Sub-project:** 1 of 4 (Data Model)  
**Scope:** Define `NarrativeEvent` and `SocialThread` types, add persistence, remove old `memories[]` and `relationships[]` from `Wrestler`.

---

## Context

The wrastlin game is moving to a **Narrative RAG** architecture for emergent storytelling. Instead of hardcoded relationship mechanics, the system stores structured narrative state (events, threads) and uses an LLM to interpret retrieved context.

This spec covers **sub-project 1 only**: the data model and persistence layer. Retrieval, mutation, and prompt integration are separate future sub-projects.

The full architecture is documented in `apps/wrastlin/docs/`.

---

## Core Concepts

### NarrativeEvent

A discrete, immutable, timestamped occurrence. The raw facts of what happened.

Examples:
- Steel interfered in Rex's match (week 5)
- Rex insulted Steel in a promo (week 6)
- Rex lost a title match (week 7)

### SocialThread

A persistent, evolving narrative construct representing the ongoing emotional or social consequence of one or more events.

Examples:
- Rex vs Steel rivalry
- Iron Wolf supports Rex
- Rex owes Iron Wolf a favor

A thread accumulates events over time and holds per-wrestler actor states describing how each involved wrestler currently feels about it.

---

## Type Definitions

New file: `libs/wrastlin/shared/src/types/narrative-event.ts`

```typescript
export interface NarrativeEvent {
  eventId: string;
  week: number;
  participants: string[];  // wrestlerIds involved
  description: string;     // e.g. "Steel interfered in Rex's title match"
  tags: string[];          // free-form e.g. ['interference', 'title', 'public']
}
```

New file: `libs/wrastlin/shared/src/types/social-thread.ts`

```typescript
export interface ThreadActorState {
  wrestlerId: string;
  care: number;    // 1–10; how much this thread is on their mind; decays over time
  stance: string;  // free-form e.g. 'aggrieved', 'dismissive', 'motivated', 'grateful'
  summary: string; // prose description of their current interpretation
                   // e.g. "Rex sees this as unfinished business"
}

export interface SocialThread {
  threadId: string;
  title: string;                // human-readable e.g. "Rex vs Steel Conflict"
                                // set by mutation layer on creation; stable anchor for wiki pages
  subjects: string[];           // wrestlerIds — the main wrestlers involved
  tags: string[];               // free-form e.g. ['conflict', 'betrayal', 'title']
  createdWeek: number;
  lastUpdatedWeek: number;
  eventIds: string[];           // references to NarrativeEvent.eventId
  actorStates: ThreadActorState[];  // one entry per involved wrestler
}
```

**Notes:**
- No `type` enum on either Event or Thread — tags provide all classification. The LLM and retrieval engine use tags freely.
- No `status` field on Thread — a thread is active while any actor has `care > 0`. Threads with all care at zero are removed from storage during cleanup.
- `actorStates` is an array embedded in the thread (not a separate collection), because retrieval needs both thread content and actor care values in one load.
- Care is per-wrestler: two actors in the same thread can care very differently about it.
- `title` is a stable human-readable anchor set once at thread creation. A future wiki agent can use `lastUpdatedWeek` and `NarrativeEvent.week` to scope to "what changed this week" and feed thread titles + actor summaries directly into wiki page prose.

---

## Wrestler Type Changes

**Clean break.** Remove from `libs/wrastlin/shared/src/types/wrestler.ts`:

- `memories: Memory[]`
- `relationships: Relationship[]`

Delete the now-unused interfaces:

- `Relationship`
- `Memory`
- `MemoryType`

The `Wrestler` type after this change:

```typescript
export interface Wrestler {
  wrestlerId: string;
  name: string;
  gimmick: string;
  stats: WrestlerStats;
  personality: WrestlerPersonality;
  emotionalState: WrestlerEmotions;
  managerTrust: number;
  finisher: string;
}
```

---

## Storage

Two new runtime files:

| File | Contents | Initial value |
|------|----------|---------------|
| `data/runtime/events.json` | `NarrativeEvent[]` | `[]` |
| `data/runtime/threads.json` | `SocialThread[]` | `[]` |

Both files grow over time. Cleanup (removing zero-care threads and unreferenced events) is a future concern handled by the mutation sub-project.

---

## Persistence Functions

Four new functions added to `apps/wrastlin/meta-service/src/core/gameState.ts`, following the existing `loadSubmissions`/`saveSubmissions` pattern:

```typescript
loadEvents(): NarrativeEvent[]
saveEvents(events: NarrativeEvent[]): void
loadThreads(): SocialThread[]
saveThreads(threads: SocialThread[]): void
```

---

## Static Data Migration

`data/static/wrestlers.json` has `memories` and `relationships` fields stripped from each wrestler entry.

---

## Downstream Code Changes

The following files reference `wrestler.memories` or `wrestler.relationships` and must be updated:

| File | Change |
|------|--------|
| `src/agents/dataBuilders.ts` | Remove memory filtering from `buildPromoScreenplayInput` |
| `src/agents/types.ts` | Remove `Memory[]` from `ParticipantForPromo` and `TargetForPromo` |
| `src/agents/dataBuilders.spec.ts` | Remove `memories: []` from wrestler fixtures |

These references are removed now. The retrieval-fed prompt context that replaces them is out of scope for this sub-project.

---

## Out of Scope

The following are covered by future sub-projects:

- Retrieval engine (scoring/ranking threads per task type)
- Mutation pipeline (post-show care decay, new thread creation)
- Prompt integration (feeding retrieved context into agent prompts)
- Thread/event cleanup logic

---

## Testing

- `loadEvents` / `saveEvents` — round-trip test (write then read, assert equality)
- `loadThreads` / `saveThreads` — round-trip test
- Compile-time verification that no code references `wrestler.memories` or `wrestler.relationships`
