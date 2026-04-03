# Retrieval Engine — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Given a context (which wrestlers are involved in a task), score and rank the active social threads by relevance so the most important narrative context can be injected into agent prompts.

**Architecture:** A pure library — no I/O, no AI. Two exported functions: `scoreThread` (scoring logic) and `retrieveRelevantThreads` (filter + score + sort + enrich). Both are pure functions that take data and return data, making them trivially testable. No CLI, no NX target — this is imported directly by the prompt integration sub-project (5).

**Tech Stack:** TypeScript, vitest. Only imports from `@org/wrastlin-shared`.

---

## Scoring Formula

```
score = subjectMatchBonus + careScore + recencyScore + tagScore

subjectMatchBonus  = (any queryWrestler is in thread.subjects) ? 5 : 0
careScore          = max care value among queryWrestlers in thread.actorStates  (0–10)
recencyScore       = max(0, 10 − (currentWeek − thread.lastUpdatedWeek))        (0–10)
tagScore           = count of preferredTags present in thread.tags, capped at 5  (0–5)

Maximum possible score: 30
```

A thread only enters scoring if at least one query wrestler appears as a `subject` or in `actorStates`. Threads with no connection to any query wrestler are excluded entirely.

---

## File Map

| Action | File | Responsibility |
|--------|------|----------------|
| Create | `src/retrieval/types.ts` | `RetrievalQuery`, `RetrievedThread` |
| Create | `src/retrieval/scoreThread.ts` | `isThreadRelevant`, `scoreThread` — pure scoring logic |
| Create | `src/retrieval/scoreThread.spec.ts` | TDD tests for scoring |
| Create | `src/retrieval/retrieveThreads.ts` | `retrieveRelevantThreads` — filter, score, sort, enrich |
| Create | `src/retrieval/retrieveThreads.spec.ts` | TDD tests for retrieval |

---

## Task 1: Types — `src/retrieval/types.ts`

**Files:**
- Create: `src/retrieval/types.ts`

No test needed — type declarations only.

- [ ] **Step 1: Create the file**

```typescript
// src/retrieval/types.ts
import type { SocialThread, ThreadActorState, NarrativeEvent } from '@org/wrastlin-shared';

export interface RetrievalQuery {
  wrestlerIds: string[];       // wrestlers we need context for (e.g. "Rex's promo" → ['w-001'])
  currentWeek: number;         // used to compute recency score
  preferredTags?: string[];    // optional: threads with these tags get a scoring bonus
  limit?: number;              // max results to return; default 5
}

export interface RetrievedThread {
  thread: SocialThread;
  score: number;
  relevantActorStates: ThreadActorState[];  // actorStates for the query wrestlers only
  linkedEvents: NarrativeEvent[];           // events attached to this thread, most recent first
}
```

- [ ] **Step 2: Commit**

```bash
git add src/retrieval/types.ts
git commit -m "feat(wrastlin): add retrieval engine types"
```

---

## Task 2: Scoring logic — TDD

**Files:**
- Create: `src/retrieval/scoreThread.ts`
- Create: `src/retrieval/scoreThread.spec.ts`

`scoreThread` is a pure function — same inputs always produce same outputs. `isThreadRelevant` is a filter helper.

### Step 1: Write failing tests

- [ ] **Create `src/retrieval/scoreThread.spec.ts`**

```typescript
import { describe, it, expect } from 'vitest';
import type { SocialThread } from '@org/wrastlin-shared';
import { scoreThread, isThreadRelevant } from './scoreThread.js';

function makeThread(overrides: Partial<SocialThread> = {}): SocialThread {
  return {
    threadId: 't-001',
    title: 'Rex vs Steel Conflict',
    subjects: ['w-001', 'w-002'],
    tags: ['conflict', 'rivalry'],
    createdWeek: 1,
    lastUpdatedWeek: 3,
    eventIds: [],
    actorStates: [
      { wrestlerId: 'w-001', care: 8, stance: 'aggrieved', summary: 'Rex wants revenge' },
      { wrestlerId: 'w-002', care: 3, stance: 'dismissive', summary: 'Steel barely cares' },
    ],
    ...overrides,
  };
}

// ── isThreadRelevant ──────────────────────────────────────────────────────────

describe('isThreadRelevant', () => {
  it('returns true when a query wrestler is in subjects', () => {
    const thread = makeThread({ subjects: ['w-001'] });
    expect(isThreadRelevant(thread, ['w-001'])).toBe(true);
  });

  it('returns true when a query wrestler is in actorStates but not subjects', () => {
    const thread = makeThread({
      subjects: ['w-002'],
      actorStates: [{ wrestlerId: 'w-001', care: 4, stance: 'curious', summary: '' }],
    });
    expect(isThreadRelevant(thread, ['w-001'])).toBe(true);
  });

  it('returns false when no query wrestler appears in subjects or actorStates', () => {
    const thread = makeThread({ subjects: ['w-003'], actorStates: [] });
    expect(isThreadRelevant(thread, ['w-001'])).toBe(false);
  });

  it('returns true when any of multiple query wrestlers matches', () => {
    const thread = makeThread({ subjects: ['w-004'] });
    expect(isThreadRelevant(thread, ['w-001', 'w-004'])).toBe(true);
  });
});

// ── scoreThread ───────────────────────────────────────────────────────────────

describe('scoreThread', () => {
  it('gives subjectMatchBonus of 5 when a query wrestler is a subject', () => {
    const thread = makeThread({ subjects: ['w-001'], actorStates: [] });
    const score = scoreThread(thread, ['w-001'], 3);
    // subjectMatch=5, care=0, recency=max(0,10-(3-3))=10
    expect(score).toBe(15);
  });

  it('gives no subjectMatchBonus when query wrestler is only in actorStates', () => {
    const thread = makeThread({
      subjects: ['w-002'],
      actorStates: [{ wrestlerId: 'w-001', care: 5, stance: '', summary: '' }],
    });
    const score = scoreThread(thread, ['w-001'], 3);
    // subjectMatch=0, care=5, recency=10
    expect(score).toBe(15);
  });

  it('careScore is the max care among query wrestlers in actorStates', () => {
    const thread = makeThread({
      subjects: ['w-001', 'w-002'],
      actorStates: [
        { wrestlerId: 'w-001', care: 6, stance: '', summary: '' },
        { wrestlerId: 'w-002', care: 9, stance: '', summary: '' },
      ],
    });
    // query is ['w-001', 'w-002'], max care = 9
    // subjectMatch=5, care=9, recency=10
    const score = scoreThread(thread, ['w-001', 'w-002'], 3);
    expect(score).toBe(24);
  });

  it('careScore is 0 when query wrestler has no actorState entry', () => {
    const thread = makeThread({ subjects: ['w-001'], actorStates: [] });
    const score = scoreThread(thread, ['w-001'], 3);
    // subjectMatch=5, care=0, recency=10
    expect(score).toBe(15);
  });

  it('recencyScore is 10 when thread was updated this week', () => {
    const thread = makeThread({ lastUpdatedWeek: 5 });
    const score = scoreThread(thread, ['w-001'], 5);
    // subjectMatch=5, care=8, recency=10
    expect(score).toBe(23);
  });

  it('recencyScore decays by 1 per week', () => {
    const thread = makeThread({ subjects: ['w-001'], actorStates: [], lastUpdatedWeek: 1 });
    const score3 = scoreThread(thread, ['w-001'], 3);  // recency = 10-(3-1) = 8
    expect(score3).toBe(13); // 5+0+8
    const score5 = scoreThread(thread, ['w-001'], 5);  // recency = 10-(5-1) = 6
    expect(score5).toBe(11); // 5+0+6
  });

  it('recencyScore floors at 0 for threads older than 10 weeks', () => {
    const thread = makeThread({ subjects: ['w-001'], actorStates: [], lastUpdatedWeek: 1 });
    const score = scoreThread(thread, ['w-001'], 12); // 10-(12-1) = -1 → 0
    expect(score).toBe(5); // 5+0+0
  });

  it('tagScore adds 1 per matching preferred tag, capped at 5', () => {
    const thread = makeThread({
      subjects: ['w-001'],
      tags: ['conflict', 'title', 'betrayal'],
      actorStates: [],
      lastUpdatedWeek: 3,
    });
    // subjectMatch=5, care=0, recency=10, tagScore=min(2,5)=2
    const score = scoreThread(thread, ['w-001'], 3, ['conflict', 'title', 'grudge']);
    expect(score).toBe(17);
  });

  it('tagScore is capped at 5 even with many matching tags', () => {
    const thread = makeThread({
      subjects: ['w-001'],
      tags: ['a', 'b', 'c', 'd', 'e', 'f', 'g'],
      actorStates: [],
      lastUpdatedWeek: 3,
    });
    const score = scoreThread(thread, ['w-001'], 3, ['a', 'b', 'c', 'd', 'e', 'f', 'g']);
    // subjectMatch=5, care=0, recency=10, tagScore=min(7,5)=5
    expect(score).toBe(20);
  });

  it('tagScore is 0 when no preferredTags provided', () => {
    const thread = makeThread({ subjects: ['w-001'], actorStates: [], lastUpdatedWeek: 3 });
    const withTags = scoreThread(thread, ['w-001'], 3, ['conflict']);
    const noTags = scoreThread(thread, ['w-001'], 3);
    // thread has tags ['conflict', 'rivalry'] — without preferredTags, tagScore=0
    expect(noTags).toBe(withTags - 1); // 1 tag matched when provided
  });

  it('full score: subject + care + recency + tags', () => {
    const thread = makeThread({
      subjects: ['w-001'],
      tags: ['conflict'],
      actorStates: [{ wrestlerId: 'w-001', care: 7, stance: '', summary: '' }],
      lastUpdatedWeek: 4,
    });
    // subjectMatch=5, care=7, recency=max(0,10-(5-4))=9, tagScore=min(1,5)=1
    const score = scoreThread(thread, ['w-001'], 5, ['conflict']);
    expect(score).toBe(22);
  });
});
```

- [ ] **Step 2: Run tests — confirm they fail**

```bash
cd /Users/tawneypauling/Documents/git/social-games/.worktrees/shared-auth/apps/wrastlin/meta-service && \
  npx vitest run src/retrieval/scoreThread.spec.ts 2>&1 | tail -5
```

Expected: `Error: Cannot find module './scoreThread.js'`

- [ ] **Step 3: Implement `src/retrieval/scoreThread.ts`**

```typescript
import type { SocialThread } from '@org/wrastlin-shared';

export function isThreadRelevant(thread: SocialThread, wrestlerIds: string[]): boolean {
  const querySet = new Set(wrestlerIds);
  return (
    thread.subjects.some(id => querySet.has(id)) ||
    thread.actorStates.some(a => querySet.has(a.wrestlerId))
  );
}

export function scoreThread(
  thread: SocialThread,
  wrestlerIds: string[],
  currentWeek: number,
  preferredTags?: string[],
): number {
  const querySet = new Set(wrestlerIds);

  const subjectMatchBonus = thread.subjects.some(id => querySet.has(id)) ? 5 : 0;

  const relevantCares = thread.actorStates
    .filter(a => querySet.has(a.wrestlerId))
    .map(a => a.care);
  const careScore = relevantCares.length > 0 ? Math.max(...relevantCares) : 0;

  const recencyScore = Math.max(0, 10 - (currentWeek - thread.lastUpdatedWeek));

  const tagScore = preferredTags
    ? Math.min(5, preferredTags.filter(t => thread.tags.includes(t)).length)
    : 0;

  return subjectMatchBonus + careScore + recencyScore + tagScore;
}
```

- [ ] **Step 4: Run tests — confirm they pass**

```bash
npx vitest run src/retrieval/scoreThread.spec.ts 2>&1 | tail -5
```

Expected: `Tests  13 passed (13)`

- [ ] **Step 5: Commit**

```bash
git add src/retrieval/scoreThread.ts src/retrieval/scoreThread.spec.ts
git commit -m "feat(wrastlin): add scoreThread and isThreadRelevant — retrieval scoring"
```

---

## Task 3: Retrieval function — TDD

**Files:**
- Create: `src/retrieval/retrieveThreads.ts`
- Create: `src/retrieval/retrieveThreads.spec.ts`

`retrieveRelevantThreads` composes: filter → score → sort → limit → enrich with events.

### Step 1: Write failing tests

- [ ] **Create `src/retrieval/retrieveThreads.spec.ts`**

```typescript
import { describe, it, expect } from 'vitest';
import type { SocialThread, NarrativeEvent } from '@org/wrastlin-shared';
import { retrieveRelevantThreads } from './retrieveThreads.js';

function makeThread(id: string, overrides: Partial<SocialThread> = {}): SocialThread {
  return {
    threadId: id,
    title: `Thread ${id}`,
    subjects: ['w-001'],
    tags: ['conflict'],
    createdWeek: 1,
    lastUpdatedWeek: 3,
    eventIds: [],
    actorStates: [{ wrestlerId: 'w-001', care: 5, stance: 'neutral', summary: '' }],
    ...overrides,
  };
}

function makeEvent(id: string, week: number, threadEventId?: string): NarrativeEvent {
  return {
    eventId: id,
    week,
    participants: ['w-001'],
    description: `Event ${id}`,
    tags: ['match-result'],
  };
}

const WEEK_3_THREAD = makeThread('t-001', { lastUpdatedWeek: 3, actorStates: [{ wrestlerId: 'w-001', care: 8, stance: '', summary: '' }] });
const WEEK_1_THREAD = makeThread('t-002', { lastUpdatedWeek: 1, actorStates: [{ wrestlerId: 'w-001', care: 8, stance: '', summary: '' }] });
const UNRELATED_THREAD = makeThread('t-003', { subjects: ['w-003'], actorStates: [] });

describe('retrieveRelevantThreads', () => {
  it('excludes threads with no connection to query wrestlers', () => {
    const result = retrieveRelevantThreads(
      { wrestlerIds: ['w-001'], currentWeek: 3 },
      [WEEK_3_THREAD, UNRELATED_THREAD],
      [],
    );
    expect(result.map(r => r.thread.threadId)).not.toContain('t-003');
  });

  it('returns threads sorted by score descending', () => {
    // t-001 is more recent (week 3) than t-002 (week 1), same care
    const result = retrieveRelevantThreads(
      { wrestlerIds: ['w-001'], currentWeek: 3 },
      [WEEK_1_THREAD, WEEK_3_THREAD],
      [],
    );
    expect(result[0].thread.threadId).toBe('t-001');
    expect(result[1].thread.threadId).toBe('t-002');
  });

  it('limits results to query.limit (default 5)', () => {
    const threads = Array.from({ length: 8 }, (_, i) => makeThread(`t-${i + 1}`));
    const result = retrieveRelevantThreads(
      { wrestlerIds: ['w-001'], currentWeek: 3 },
      threads,
      [],
    );
    expect(result.length).toBeLessThanOrEqual(5);
  });

  it('respects custom limit', () => {
    const threads = Array.from({ length: 8 }, (_, i) => makeThread(`t-${i + 1}`));
    const result = retrieveRelevantThreads(
      { wrestlerIds: ['w-001'], currentWeek: 3, limit: 3 },
      threads,
      [],
    );
    expect(result).toHaveLength(3);
  });

  it('returns fewer results than limit when fewer threads are relevant', () => {
    const result = retrieveRelevantThreads(
      { wrestlerIds: ['w-001'], currentWeek: 3, limit: 10 },
      [WEEK_3_THREAD],
      [],
    );
    expect(result).toHaveLength(1);
  });

  it('each result includes the score', () => {
    const result = retrieveRelevantThreads(
      { wrestlerIds: ['w-001'], currentWeek: 3 },
      [WEEK_3_THREAD],
      [],
    );
    expect(typeof result[0].score).toBe('number');
    expect(result[0].score).toBeGreaterThan(0);
  });

  it('relevantActorStates contains only the query wrestlers actorStates', () => {
    const thread = makeThread('t-mixed', {
      actorStates: [
        { wrestlerId: 'w-001', care: 7, stance: '', summary: '' },
        { wrestlerId: 'w-999', care: 9, stance: '', summary: '' },
      ],
    });
    const result = retrieveRelevantThreads(
      { wrestlerIds: ['w-001'], currentWeek: 3 },
      [thread],
      [],
    );
    expect(result[0].relevantActorStates).toHaveLength(1);
    expect(result[0].relevantActorStates[0].wrestlerId).toBe('w-001');
  });

  it('linkedEvents are events whose eventId is in thread.eventIds', () => {
    const thread = makeThread('t-001', { eventIds: ['e-001', 'e-002'] });
    const events: NarrativeEvent[] = [
      makeEvent('e-001', 3),
      makeEvent('e-002', 2),
      makeEvent('e-999', 1),  // not linked to this thread
    ];
    const result = retrieveRelevantThreads(
      { wrestlerIds: ['w-001'], currentWeek: 3 },
      [thread],
      events,
    );
    const linkedIds = result[0].linkedEvents.map(e => e.eventId);
    expect(linkedIds).toContain('e-001');
    expect(linkedIds).toContain('e-002');
    expect(linkedIds).not.toContain('e-999');
  });

  it('linkedEvents are sorted most recent first', () => {
    const thread = makeThread('t-001', { eventIds: ['e-001', 'e-002', 'e-003'] });
    const events: NarrativeEvent[] = [
      makeEvent('e-001', 1),
      makeEvent('e-002', 3),
      makeEvent('e-003', 2),
    ];
    const result = retrieveRelevantThreads(
      { wrestlerIds: ['w-001'], currentWeek: 3 },
      [thread],
      events,
    );
    const weeks = result[0].linkedEvents.map(e => e.week);
    expect(weeks).toEqual([3, 2, 1]);
  });

  it('preferred tags boost threads with matching tags above those without', () => {
    const withTag = makeThread('t-conflict', {
      tags: ['conflict', 'rivalry'],
      actorStates: [{ wrestlerId: 'w-001', care: 5, stance: '', summary: '' }],
      lastUpdatedWeek: 1,  // older — would score lower without tag bonus
    });
    const withoutTag = makeThread('t-title', {
      tags: ['title'],
      actorStates: [{ wrestlerId: 'w-001', care: 5, stance: '', summary: '' }],
      lastUpdatedWeek: 3,  // newer — scores higher without tag boost
    });
    // Without preferred tags, t-title wins (more recent)
    const withoutPref = retrieveRelevantThreads(
      { wrestlerIds: ['w-001'], currentWeek: 3 },
      [withTag, withoutTag],
      [],
    );
    expect(withoutPref[0].thread.threadId).toBe('t-title');

    // With preferred tag 'conflict', t-conflict gets +3 bonus — enough to overtake
    const withPref = retrieveRelevantThreads(
      { wrestlerIds: ['w-001'], currentWeek: 3, preferredTags: ['conflict', 'rivalry'] },
      [withTag, withoutTag],
      [],
    );
    expect(withPref[0].thread.threadId).toBe('t-conflict');
  });

  it('returns empty array when no threads are relevant', () => {
    const result = retrieveRelevantThreads(
      { wrestlerIds: ['w-999'], currentWeek: 3 },
      [WEEK_3_THREAD, UNRELATED_THREAD],
      [],
    );
    expect(result).toHaveLength(0);
  });

  it('handles empty threads array', () => {
    const result = retrieveRelevantThreads(
      { wrestlerIds: ['w-001'], currentWeek: 3 },
      [],
      [],
    );
    expect(result).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run tests — confirm they fail**

```bash
npx vitest run src/retrieval/retrieveThreads.spec.ts 2>&1 | tail -5
```

Expected: `Error: Cannot find module './retrieveThreads.js'`

- [ ] **Step 3: Implement `src/retrieval/retrieveThreads.ts`**

```typescript
import type { SocialThread, NarrativeEvent, ThreadActorState } from '@org/wrastlin-shared';
import type { RetrievalQuery, RetrievedThread } from './types.js';
import { isThreadRelevant, scoreThread } from './scoreThread.js';

export function retrieveRelevantThreads(
  query: RetrievalQuery,
  allThreads: SocialThread[],
  allEvents: NarrativeEvent[],
): RetrievedThread[] {
  const { wrestlerIds, currentWeek, preferredTags, limit = 5 } = query;
  const querySet = new Set(wrestlerIds);
  const eventMap = new Map(allEvents.map(e => [e.eventId, e]));

  return allThreads
    .filter(thread => isThreadRelevant(thread, wrestlerIds))
    .map(thread => {
      const score = scoreThread(thread, wrestlerIds, currentWeek, preferredTags);

      const relevantActorStates: ThreadActorState[] = thread.actorStates.filter(
        a => querySet.has(a.wrestlerId),
      );

      const linkedEvents: NarrativeEvent[] = thread.eventIds
        .map(id => eventMap.get(id))
        .filter((e): e is NarrativeEvent => e !== undefined)
        .sort((a, b) => b.week - a.week);

      return { thread, score, relevantActorStates, linkedEvents };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}
```

- [ ] **Step 4: Run tests — confirm they pass**

```bash
npx vitest run src/retrieval/retrieveThreads.spec.ts 2>&1 | tail -5
```

Expected: `Tests  12 passed (12)`

- [ ] **Step 5: Full suite check**

```bash
cd /Users/tawneypauling/Documents/git/social-games/.worktrees/shared-auth && \
  pnpm nx test wrastlin-service --skip-nx-cache 2>&1 | grep -E "Test Files|Tests "
```

Expected: only the pre-existing judgeAgent failure; all other tests pass.

- [ ] **Step 6: Commit**

```bash
git add src/retrieval/retrieveThreads.ts src/retrieval/retrieveThreads.spec.ts
git commit -m "feat(wrastlin): add retrieveRelevantThreads — score and rank social threads by relevance"
```

---

## Self-Review

**Spec coverage:**

| Requirement | Task |
|-------------|------|
| Given context (wrestler IDs), retrieve relevant threads | Task 3 |
| Scoring: care level | Task 2 (careScore = max care among query wrestlers) |
| Scoring: recency | Task 2 (decays 1 per week, floors at 0) |
| Scoring: tag match | Task 2 (preferred tag bonus, capped at 5) |
| Scoring: subject match | Task 2 (subject match bonus = 5) |
| Ranked list of threads | Task 3 (sorted by score desc) |
| Include recent events for each thread | Task 3 (linkedEvents sorted week desc) |
| Ready for prompt injection | `relevantActorStates` + `linkedEvents` carry everything needed |

**Type consistency:**
- `RetrievalQuery.wrestlerIds` → consumed by `isThreadRelevant`, `scoreThread`, `retrieveRelevantThreads` ✓
- `RetrievedThread.relevantActorStates: ThreadActorState[]` — from `@org/wrastlin-shared` ✓
- `scoreThread(thread, wrestlerIds, currentWeek, preferredTags?)` — used in Task 3 ✓
- `isThreadRelevant(thread, wrestlerIds)` — used in Task 3 ✓

**Does NOT do (out of scope):**
- Decay mutation — scoring uses recency but does NOT write decay back to threads.json (that's post-show mutations)
- Keyword or semantic search — scoring is structural only (subjects, actorStates, tags, recency)
- Loading threads/events from disk — caller's responsibility; this is a pure library
