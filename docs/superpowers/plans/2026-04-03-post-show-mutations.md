# Post-Show Mutation Pipeline — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** After a show is generated, extract narrative events from it, mutate the social thread graph via an AI agent, and apply emotional state changes to wrestlers — so week 2+ has real narrative context.

**Architecture:** Three sequential stages run in a new CLI script (`run-post-show`). Stage 1 (event extraction) and Stage 3 (emotional state updates) are pure structural logic with no AI. Stage 2 (thread mutation) calls an OpenAI agent that reads the new events + existing threads and decides what to create or update. All stages read/write from `data/runtime/`. The `--stub` flag bypasses the AI call with a no-op stub agent.

**Tech Stack:** TypeScript, Node ESM, OpenAI gpt-4o, vitest, esbuild, `@org/wrastlin-shared` (NarrativeEvent, SocialThread, ThreadActorState), `crypto.randomUUID()`

---

## Sequence in the weekly loop

```
generate-show           (already built)
    ↓
run-post-show           ← THIS PLAN
  Stage 1: extract NarrativeEvents from show JSON
  Stage 2: AI mutates threads (create new, update existing)
  Stage 3: apply winner/loser emotional state changes to wrestlers
    ↓
advance-week            (already built)
```

---

## File Map

| Action | File | Responsibility |
|--------|------|----------------|
| Create | `src/postShow/types.ts` | `ThreadMutationInput`, `ThreadMutationOutput`, `NewThreadSpec`, `ThreadUpdateSpec`, `ThreadMutationAgentFn` |
| Create | `src/postShow/eventExtractor.ts` | Derive `NarrativeEvent[]` from `GeneratedShow` + name map (no AI) |
| Create | `src/postShow/eventExtractor.spec.ts` | TDD for event extraction |
| Create | `src/postShow/emotionalStateUpdater.ts` | Apply winner/loser confidence + frustration deltas (no AI) |
| Create | `src/postShow/emotionalStateUpdater.spec.ts` | TDD for emotional state logic |
| Create | `src/postShow/threadMutator.ts` | Apply `ThreadMutationOutput` onto `SocialThread[]` — pure function, no I/O |
| Create | `src/postShow/threadMutator.spec.ts` | TDD for thread merge logic |
| Create | `src/postShow/stubThreadMutationAgent.ts` | No-op stub — returns empty `newThreads` and `threadUpdates` |
| Create | `prompts/thread-mutation.md` | Prompt template for the AI agent |
| Create | `src/postShow/openaiThreadMutationAgent.ts` | Calls gpt-4o, parses and validates `ThreadMutationOutput` |
| Create | `src/postShow/threadMutationAgent.spec.ts` | TDD for real agent |
| Create | `src/postShow/applyPostShowUpdates.ts` | Orchestrator: load show → extract events → call agent → apply mutations → save |
| Create | `src/run-post-show.ts` | Thin CLI entry — reads `--week N` + `--stub`, calls orchestrator |
| Modify | `scripts/build.cjs` | Add `run-post-show` to `runEntries` array + update console.log |
| Modify | `project.json` | Add `apply-post-show-updates` NX target |

---

## Task 1: Types — `src/postShow/types.ts`

**Files:**
- Create: `src/postShow/types.ts`

No test needed — these are type declarations only.

- [ ] **Step 1: Create the file**

```typescript
// src/postShow/types.ts
import type { NarrativeEvent, SocialThread, ThreadActorState } from '@org/wrastlin-shared';

export interface ThreadMutationInput {
  week: number;
  newEvents: NarrativeEvent[];          // events extracted from this week's show
  existingThreads: SocialThread[];       // all threads currently in threads.json
  wrestlers: Array<{ wrestlerId: string; name: string; gimmick: string }>;
}

// A brand-new thread the agent wants to create
export interface NewThreadSpec {
  title: string;
  subjects: string[];          // wrestlerIds — main wrestlers this thread is about
  tags: string[];
  eventIds: string[];          // IDs from newEvents that triggered this thread
  actorStates: ThreadActorState[];
}

// Changes to apply to an existing thread
export interface ThreadUpdateSpec {
  threadId: string;            // must exist in existingThreads
  addEventIds: string[];       // IDs from newEvents to append to thread.eventIds
  updatedActorStates: ThreadActorState[];  // merged by wrestlerId into existing actorStates
}

export interface ThreadMutationOutput {
  newThreads: NewThreadSpec[];
  threadUpdates: ThreadUpdateSpec[];
}

export type ThreadMutationAgentFn = (
  input: ThreadMutationInput
) => Promise<ThreadMutationOutput>;
```

- [ ] **Step 2: Commit**

```bash
git add src/postShow/types.ts
git commit -m "feat(wrastlin): add post-show mutation types"
```

---

## Task 2: Event extractor — TDD

**Files:**
- Create: `src/postShow/eventExtractor.ts`
- Create: `src/postShow/eventExtractor.spec.ts`

The extractor derives `NarrativeEvent` records from the generated show. It uses a `nameMap` (wrestlerId → name) so descriptions are human-readable.

### Step 1: Write failing tests

- [ ] **Create `src/postShow/eventExtractor.spec.ts`**

```typescript
import { describe, it, expect } from 'vitest';
import { extractEvents } from './eventExtractor.js';
import type { GeneratedShow } from '../agents/types.js';

function makeShow(overrides: Partial<GeneratedShow> = {}): GeneratedShow {
  return {
    showOutline: { showId: 'show-1', week: 2, segments: [] },
    segments: [],
    wrestlerThoughtProcess: [],
    ...overrides,
  };
}

const NAMES = new Map([
  ['w-001', 'Rex Dominion'],
  ['w-002', 'Steel Purity'],
  ['w-003', 'Slick Vince'],
]);

const MATCH_SEGMENT = {
  type: 'match' as const,
  segmentId: 'seg-1',
  order: 1,
  matchType: 'singles',
  participants: [['w-001'], ['w-002']],
  interference: [] as string[],
  headliner: false,
  beats: {
    segmentId: 'seg-1',
    beats: [],
    result: { winner: 'w-001', finishType: 'clean' as const, crowdReaction: 'hot' as const },
  },
  announcerScreenplay: { segmentId: 'seg-1', actors: [], screenplay: '' },
};

const PROMO_SEGMENT = {
  type: 'promo' as const,
  segmentId: 'seg-2',
  order: 2,
  participants: ['w-001'],
  target: 'w-002',
  goal: 'call out Steel',
  promoScreenplay: { segmentId: 'seg-2', actors: [], screenplay: '' },
};

describe('extractEvents', () => {
  it('returns one event per match result', () => {
    const show = makeShow({ segments: [MATCH_SEGMENT] });
    const events = extractEvents(show, 2, NAMES);
    const matchEvents = events.filter(e => e.tags.includes('match-result'));
    expect(matchEvents).toHaveLength(1);
  });

  it('match event description uses wrestler names', () => {
    const show = makeShow({ segments: [MATCH_SEGMENT] });
    const [event] = extractEvents(show, 2, NAMES);
    expect(event.description).toContain('Rex Dominion');
    expect(event.description).toContain('Steel Purity');
  });

  it('match event includes all participants', () => {
    const show = makeShow({ segments: [MATCH_SEGMENT] });
    const [event] = extractEvents(show, 2, NAMES);
    expect(event.participants).toContain('w-001');
    expect(event.participants).toContain('w-002');
  });

  it('match event tags include matchType', () => {
    const show = makeShow({ segments: [MATCH_SEGMENT] });
    const [event] = extractEvents(show, 2, NAMES);
    expect(event.tags).toContain('singles');
  });

  it('headliner match includes headliner tag', () => {
    const show = makeShow({ segments: [{ ...MATCH_SEGMENT, headliner: true }] });
    const events = extractEvents(show, 2, NAMES);
    const matchEvent = events.find(e => e.tags.includes('match-result'))!;
    expect(matchEvent.tags).toContain('headliner');
  });

  it('non-headliner match does not include headliner tag', () => {
    const show = makeShow({ segments: [MATCH_SEGMENT] });
    const [event] = extractEvents(show, 2, NAMES);
    expect(event.tags).not.toContain('headliner');
  });

  it('interference creates a separate event', () => {
    const withInterference = { ...MATCH_SEGMENT, interference: ['w-003'] };
    const show = makeShow({ segments: [withInterference] });
    const events = extractEvents(show, 2, NAMES);
    const interferenceEvents = events.filter(e => e.tags.includes('interference'));
    expect(interferenceEvents).toHaveLength(1);
    expect(interferenceEvents[0].description).toContain('Slick Vince');
    expect(interferenceEvents[0].participants).toContain('w-003');
  });

  it('promo callout creates an event when target is set', () => {
    const show = makeShow({ segments: [PROMO_SEGMENT] });
    const events = extractEvents(show, 2, NAMES);
    expect(events).toHaveLength(1);
    expect(events[0].tags).toContain('callout');
  });

  it('promo without target creates no event', () => {
    const selfHype = { ...PROMO_SEGMENT, target: undefined };
    const show = makeShow({ segments: [selfHype] });
    const events = extractEvents(show, 2, NAMES);
    expect(events).toHaveLength(0);
  });

  it('each event has a unique eventId', () => {
    const withInterference = { ...MATCH_SEGMENT, interference: ['w-003'] };
    const show = makeShow({ segments: [withInterference, PROMO_SEGMENT] });
    const events = extractEvents(show, 2, NAMES);
    const ids = events.map(e => e.eventId);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('each event has the correct week', () => {
    const show = makeShow({ segments: [MATCH_SEGMENT] });
    const events = extractEvents(show, 5, NAMES);
    expect(events.every(e => e.week === 5)).toBe(true);
  });
});
```

- [ ] **Step 2: Run tests — confirm they fail**

```bash
cd apps/wrastlin/meta-service && npx vitest run src/postShow/eventExtractor.spec.ts 2>&1 | tail -5
```

Expected: `Error: Cannot find module './eventExtractor.js'`

- [ ] **Step 3: Implement `src/postShow/eventExtractor.ts`**

```typescript
import { randomUUID } from 'node:crypto';
import type { NarrativeEvent } from '@org/wrastlin-shared';
import type { GeneratedShow, GeneratedMatchSegment, GeneratedPromoSegment } from '../agents/types.js';

export function extractEvents(
  show: GeneratedShow,
  week: number,
  nameMap: Map<string, string>,
): NarrativeEvent[] {
  const events: NarrativeEvent[] = [];

  for (const segment of show.segments) {
    if (segment.type === 'match') {
      const seg = segment as GeneratedMatchSegment;
      const allParticipants = seg.participants.flat();
      const winner = seg.beats.result.winner;
      const losers = allParticipants.filter(id => id !== winner);
      const winnerName = nameMap.get(winner) ?? winner;
      const loserNames = losers.map(id => nameMap.get(id) ?? id).join(' and ');

      const tags = ['match-result', seg.matchType];
      if (seg.headliner) tags.push('headliner');

      events.push({
        eventId: randomUUID(),
        week,
        participants: [...allParticipants, ...seg.interference],
        description: `${winnerName} defeated ${loserNames} by ${seg.beats.result.finishType}`,
        tags,
      });

      for (const interferer of seg.interference) {
        const interfererName = nameMap.get(interferer) ?? interferer;
        const matchDesc = allParticipants.map(id => nameMap.get(id) ?? id).join(' vs ');
        events.push({
          eventId: randomUUID(),
          week,
          participants: [interferer, ...allParticipants],
          description: `${interfererName} interfered in the ${matchDesc} match`,
          tags: ['interference', seg.matchType],
        });
      }
    } else {
      const seg = segment as GeneratedPromoSegment;
      if (seg.target) {
        const callers = seg.participants.map(id => nameMap.get(id) ?? id).join(' and ');
        const targetName = nameMap.get(seg.target) ?? seg.target;
        events.push({
          eventId: randomUUID(),
          week,
          participants: [...seg.participants, seg.target],
          description: `${callers} called out ${targetName}`,
          tags: ['promo', 'callout'],
        });
      }
    }
  }

  return events;
}
```

- [ ] **Step 4: Run tests — confirm they pass**

```bash
npx vitest run src/postShow/eventExtractor.spec.ts 2>&1 | tail -5
```

Expected: `Tests  11 passed (11)`

- [ ] **Step 5: Full suite check**

```bash
cd /Users/tawneypauling/Documents/git/social-games/.worktrees/shared-auth && pnpm nx test wrastlin-service --skip-nx-cache 2>&1 | grep -E "Test Files|Tests "
```

Expected: only the pre-existing judgeAgent failure; all other tests pass.

- [ ] **Step 6: Commit**

```bash
git add src/postShow/eventExtractor.ts src/postShow/eventExtractor.spec.ts
git commit -m "feat(wrastlin): add extractEvents — derive NarrativeEvents from GeneratedShow"
```

---

## Task 3: Emotional state updater — TDD

**Files:**
- Create: `src/postShow/emotionalStateUpdater.ts`
- Create: `src/postShow/emotionalStateUpdater.spec.ts`

Pure function: takes `Wrestler[]` + `GeneratedShow`, returns updated `Wrestler[]`. Winners gain confidence, losers gain frustration. All values clamped to 1–10.

### Step 1: Write failing tests

- [ ] **Create `src/postShow/emotionalStateUpdater.spec.ts`**

```typescript
import { describe, it, expect } from 'vitest';
import { applyEmotionalStateUpdates } from './emotionalStateUpdater.js';
import type { Wrestler } from '@org/wrastlin-shared';
import type { GeneratedShow } from '../agents/types.js';

function makeWrestler(id: string, overrides: Partial<Wrestler['emotionalState']> = {}): Wrestler {
  return {
    wrestlerId: id,
    name: `Wrestler ${id}`,
    gimmick: 'Test',
    stats: { strength: 70, agility: 70, endurance: 70, charisma: 70 },
    personality: { ego: 5, anger: 5, honor: 5, loyalty: 5, ambition: 5 },
    emotionalState: { confidence: 5, frustration: 5, fatigue: 5, ...overrides },
    managerTrust: 5,
    finisher: 'Finisher',
  };
}

function makeShow(winner: string, loser: string): GeneratedShow {
  return {
    showOutline: { showId: 'show-1', week: 2, segments: [] },
    wrestlerThoughtProcess: [],
    segments: [
      {
        type: 'match',
        segmentId: 'seg-1',
        order: 1,
        matchType: 'singles',
        participants: [[winner], [loser]],
        interference: [],
        headliner: false,
        beats: {
          segmentId: 'seg-1',
          beats: [],
          result: { winner, finishType: 'clean', crowdReaction: 'hot' },
        },
        announcerScreenplay: { segmentId: 'seg-1', actors: [], screenplay: '' },
      },
    ],
  };
}

describe('applyEmotionalStateUpdates', () => {
  it('winner gains confidence', () => {
    const wrestlers = [makeWrestler('w-001'), makeWrestler('w-002')];
    const result = applyEmotionalStateUpdates(wrestlers, makeShow('w-001', 'w-002'));
    const winner = result.find(w => w.wrestlerId === 'w-001')!;
    expect(winner.emotionalState.confidence).toBe(6);
  });

  it('winner loses frustration', () => {
    const wrestlers = [makeWrestler('w-001'), makeWrestler('w-002')];
    const result = applyEmotionalStateUpdates(wrestlers, makeShow('w-001', 'w-002'));
    const winner = result.find(w => w.wrestlerId === 'w-001')!;
    expect(winner.emotionalState.frustration).toBe(4);
  });

  it('loser loses confidence', () => {
    const wrestlers = [makeWrestler('w-001'), makeWrestler('w-002')];
    const result = applyEmotionalStateUpdates(wrestlers, makeShow('w-001', 'w-002'));
    const loser = result.find(w => w.wrestlerId === 'w-002')!;
    expect(loser.emotionalState.confidence).toBe(4);
  });

  it('loser gains frustration', () => {
    const wrestlers = [makeWrestler('w-001'), makeWrestler('w-002')];
    const result = applyEmotionalStateUpdates(wrestlers, makeShow('w-001', 'w-002'));
    const loser = result.find(w => w.wrestlerId === 'w-002')!;
    expect(loser.emotionalState.frustration).toBe(6);
  });

  it('confidence does not exceed 10', () => {
    const wrestlers = [makeWrestler('w-001', { confidence: 10 }), makeWrestler('w-002')];
    const result = applyEmotionalStateUpdates(wrestlers, makeShow('w-001', 'w-002'));
    const winner = result.find(w => w.wrestlerId === 'w-001')!;
    expect(winner.emotionalState.confidence).toBe(10);
  });

  it('confidence does not drop below 1', () => {
    const wrestlers = [makeWrestler('w-001'), makeWrestler('w-002', { confidence: 1 })];
    const result = applyEmotionalStateUpdates(wrestlers, makeShow('w-001', 'w-002'));
    const loser = result.find(w => w.wrestlerId === 'w-002')!;
    expect(loser.emotionalState.confidence).toBe(1);
  });

  it('frustration does not exceed 10', () => {
    const wrestlers = [makeWrestler('w-001'), makeWrestler('w-002', { frustration: 10 })];
    const result = applyEmotionalStateUpdates(wrestlers, makeShow('w-001', 'w-002'));
    const loser = result.find(w => w.wrestlerId === 'w-002')!;
    expect(loser.emotionalState.frustration).toBe(10);
  });

  it('frustration does not drop below 1', () => {
    const wrestlers = [makeWrestler('w-001', { frustration: 1 }), makeWrestler('w-002')];
    const result = applyEmotionalStateUpdates(wrestlers, makeShow('w-001', 'w-002'));
    const winner = result.find(w => w.wrestlerId === 'w-001')!;
    expect(winner.emotionalState.frustration).toBe(1);
  });

  it('wrestlers not in any match are unchanged', () => {
    const wrestlers = [makeWrestler('w-001'), makeWrestler('w-002'), makeWrestler('w-003')];
    const result = applyEmotionalStateUpdates(wrestlers, makeShow('w-001', 'w-002'));
    const bystander = result.find(w => w.wrestlerId === 'w-003')!;
    expect(bystander.emotionalState).toEqual({ confidence: 5, frustration: 5, fatigue: 5 });
  });

  it('applies changes across multiple match segments', () => {
    const wrestlers = [makeWrestler('w-001'), makeWrestler('w-002'), makeWrestler('w-003'), makeWrestler('w-004')];
    const show: GeneratedShow = {
      showOutline: { showId: 's', week: 2, segments: [] },
      wrestlerThoughtProcess: [],
      segments: [
        {
          type: 'match', segmentId: 's1', order: 1, matchType: 'singles',
          participants: [['w-001'], ['w-002']], interference: [], headliner: false,
          beats: { segmentId: 's1', beats: [], result: { winner: 'w-001', finishType: 'clean', crowdReaction: 'hot' } },
          announcerScreenplay: { segmentId: 's1', actors: [], screenplay: '' },
        },
        {
          type: 'match', segmentId: 's2', order: 2, matchType: 'singles',
          participants: [['w-003'], ['w-004']], interference: [], headliner: true,
          beats: { segmentId: 's2', beats: [], result: { winner: 'w-004', finishType: 'clean', crowdReaction: 'hot' } },
          announcerScreenplay: { segmentId: 's2', actors: [], screenplay: '' },
        },
      ],
    };
    const result = applyEmotionalStateUpdates(wrestlers, show);
    expect(result.find(w => w.wrestlerId === 'w-001')!.emotionalState.confidence).toBe(6);
    expect(result.find(w => w.wrestlerId === 'w-002')!.emotionalState.confidence).toBe(4);
    expect(result.find(w => w.wrestlerId === 'w-003')!.emotionalState.confidence).toBe(4);
    expect(result.find(w => w.wrestlerId === 'w-004')!.emotionalState.confidence).toBe(6);
  });

  it('returns a new array (does not mutate input)', () => {
    const wrestlers = [makeWrestler('w-001'), makeWrestler('w-002')];
    const original = wrestlers[0].emotionalState.confidence;
    applyEmotionalStateUpdates(wrestlers, makeShow('w-001', 'w-002'));
    expect(wrestlers[0].emotionalState.confidence).toBe(original);
  });
});
```

- [ ] **Step 2: Run tests — confirm they fail**

```bash
npx vitest run src/postShow/emotionalStateUpdater.spec.ts 2>&1 | tail -5
```

Expected: `Error: Cannot find module './emotionalStateUpdater.js'`

- [ ] **Step 3: Implement `src/postShow/emotionalStateUpdater.ts`**

```typescript
import type { Wrestler } from '@org/wrastlin-shared';
import type { GeneratedShow, GeneratedMatchSegment } from '../agents/types.js';

function clamp(val: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, val));
}

export function applyEmotionalStateUpdates(
  wrestlers: Wrestler[],
  show: GeneratedShow,
): Wrestler[] {
  const winners = new Set<string>();
  const losers = new Set<string>();

  for (const segment of show.segments) {
    if (segment.type !== 'match') continue;
    const seg = segment as GeneratedMatchSegment;
    const winner = seg.beats.result.winner;
    winners.add(winner);
    seg.participants.flat()
      .filter(id => id !== winner)
      .forEach(id => losers.add(id));
  }

  return wrestlers.map(wrestler => {
    const { emotionalState } = wrestler;
    let { confidence, frustration, fatigue } = emotionalState;

    if (winners.has(wrestler.wrestlerId)) {
      confidence = clamp(confidence + 1, 1, 10);
      frustration = clamp(frustration - 1, 1, 10);
    } else if (losers.has(wrestler.wrestlerId)) {
      confidence = clamp(confidence - 1, 1, 10);
      frustration = clamp(frustration + 1, 1, 10);
    } else {
      return wrestler; // unchanged
    }

    return { ...wrestler, emotionalState: { confidence, frustration, fatigue } };
  });
}
```

- [ ] **Step 4: Run tests — confirm they pass**

```bash
npx vitest run src/postShow/emotionalStateUpdater.spec.ts 2>&1 | tail -5
```

Expected: `Tests  11 passed (11)`

- [ ] **Step 5: Commit**

```bash
git add src/postShow/emotionalStateUpdater.ts src/postShow/emotionalStateUpdater.spec.ts
git commit -m "feat(wrastlin): add applyEmotionalStateUpdates — winner/loser confidence and frustration"
```

---

## Task 4: Thread mutator — TDD

**Files:**
- Create: `src/postShow/threadMutator.ts`
- Create: `src/postShow/threadMutator.spec.ts`

Pure function that merges `ThreadMutationOutput` onto the existing thread list. No I/O, no AI. This is the most complex structural piece.

### Step 1: Write failing tests

- [ ] **Create `src/postShow/threadMutator.spec.ts`**

```typescript
import { describe, it, expect } from 'vitest';
import { applyThreadMutations } from './threadMutator.js';
import type { SocialThread } from '@org/wrastlin-shared';
import type { ThreadMutationOutput } from './types.js';

const EXISTING_THREAD: SocialThread = {
  threadId: 't-001',
  title: 'Rex vs Steel Conflict',
  subjects: ['w-001', 'w-002'],
  tags: ['conflict'],
  createdWeek: 1,
  lastUpdatedWeek: 1,
  eventIds: ['e-old-1'],
  actorStates: [
    { wrestlerId: 'w-001', care: 7, stance: 'aggrieved', summary: 'Rex wants revenge' },
    { wrestlerId: 'w-002', care: 3, stance: 'dismissive', summary: 'Steel barely cares' },
  ],
};

const EMPTY_OUTPUT: ThreadMutationOutput = { newThreads: [], threadUpdates: [] };

describe('applyThreadMutations', () => {
  it('returns existing threads unchanged when output is empty', () => {
    const result = applyThreadMutations([EXISTING_THREAD], EMPTY_OUTPUT, 2);
    expect(result).toHaveLength(1);
    expect(result[0].threadId).toBe('t-001');
  });

  it('creates new threads from newThreads specs', () => {
    const output: ThreadMutationOutput = {
      newThreads: [{
        title: 'Rex Title Chase',
        subjects: ['w-001'],
        tags: ['title'],
        eventIds: ['e-001'],
        actorStates: [{ wrestlerId: 'w-001', care: 8, stance: 'motivated', summary: 'Rex wants the belt' }],
      }],
      threadUpdates: [],
    };
    const result = applyThreadMutations([], output, 2);
    expect(result).toHaveLength(1);
    expect(result[0].title).toBe('Rex Title Chase');
    expect(result[0].subjects).toEqual(['w-001']);
    expect(result[0].tags).toEqual(['title']);
  });

  it('new threads get a generated threadId (non-empty string)', () => {
    const output: ThreadMutationOutput = {
      newThreads: [{ title: 'New', subjects: ['w-001'], tags: [], eventIds: [], actorStates: [] }],
      threadUpdates: [],
    };
    const result = applyThreadMutations([], output, 2);
    expect(typeof result[0].threadId).toBe('string');
    expect(result[0].threadId.length).toBeGreaterThan(0);
  });

  it('new threads get createdWeek and lastUpdatedWeek set to current week', () => {
    const output: ThreadMutationOutput = {
      newThreads: [{ title: 'New', subjects: ['w-001'], tags: [], eventIds: ['e-1'], actorStates: [] }],
      threadUpdates: [],
    };
    const result = applyThreadMutations([], output, 3);
    expect(result[0].createdWeek).toBe(3);
    expect(result[0].lastUpdatedWeek).toBe(3);
  });

  it('new threads have the correct eventIds from the spec', () => {
    const output: ThreadMutationOutput = {
      newThreads: [{ title: 'New', subjects: ['w-001'], tags: [], eventIds: ['e-abc', 'e-xyz'], actorStates: [] }],
      threadUpdates: [],
    };
    const result = applyThreadMutations([], output, 2);
    expect(result[0].eventIds).toEqual(['e-abc', 'e-xyz']);
  });

  it('thread update appends new eventIds to existing thread', () => {
    const output: ThreadMutationOutput = {
      newThreads: [],
      threadUpdates: [{ threadId: 't-001', addEventIds: ['e-new-1'], updatedActorStates: [] }],
    };
    const result = applyThreadMutations([EXISTING_THREAD], output, 2);
    const updated = result.find(t => t.threadId === 't-001')!;
    expect(updated.eventIds).toContain('e-old-1');
    expect(updated.eventIds).toContain('e-new-1');
  });

  it('thread update merges actorStates by wrestlerId (updates existing)', () => {
    const output: ThreadMutationOutput = {
      newThreads: [],
      threadUpdates: [{
        threadId: 't-001',
        addEventIds: [],
        updatedActorStates: [{ wrestlerId: 'w-001', care: 10, stance: 'vengeful', summary: 'Rex is consumed by this' }],
      }],
    };
    const result = applyThreadMutations([EXISTING_THREAD], output, 2);
    const updated = result.find(t => t.threadId === 't-001')!;
    const rexState = updated.actorStates.find(a => a.wrestlerId === 'w-001')!;
    expect(rexState.care).toBe(10);
    expect(rexState.stance).toBe('vengeful');
    // w-002 should remain unchanged
    const steelState = updated.actorStates.find(a => a.wrestlerId === 'w-002')!;
    expect(steelState.care).toBe(3);
  });

  it('thread update adds new actorState for a wrestler not previously in the thread', () => {
    const output: ThreadMutationOutput = {
      newThreads: [],
      threadUpdates: [{
        threadId: 't-001',
        addEventIds: [],
        updatedActorStates: [{ wrestlerId: 'w-003', care: 5, stance: 'curious', summary: 'New player watching from afar' }],
      }],
    };
    const result = applyThreadMutations([EXISTING_THREAD], output, 2);
    const updated = result.find(t => t.threadId === 't-001')!;
    expect(updated.actorStates).toHaveLength(3);
    const newState = updated.actorStates.find(a => a.wrestlerId === 'w-003')!;
    expect(newState.care).toBe(5);
  });

  it('thread update sets lastUpdatedWeek to current week', () => {
    const output: ThreadMutationOutput = {
      newThreads: [],
      threadUpdates: [{ threadId: 't-001', addEventIds: ['e-new'], updatedActorStates: [] }],
    };
    const result = applyThreadMutations([EXISTING_THREAD], output, 4);
    const updated = result.find(t => t.threadId === 't-001')!;
    expect(updated.lastUpdatedWeek).toBe(4);
  });

  it('returns existing + new threads together', () => {
    const output: ThreadMutationOutput = {
      newThreads: [{ title: 'Brand New', subjects: ['w-003'], tags: [], eventIds: [], actorStates: [] }],
      threadUpdates: [],
    };
    const result = applyThreadMutations([EXISTING_THREAD], output, 2);
    expect(result).toHaveLength(2);
    const ids = result.map(t => t.threadId);
    expect(ids).toContain('t-001');
  });

  it('does not mutate the input array', () => {
    const threads = [EXISTING_THREAD];
    const output: ThreadMutationOutput = {
      newThreads: [],
      threadUpdates: [{ threadId: 't-001', addEventIds: ['e-new'], updatedActorStates: [] }],
    };
    applyThreadMutations(threads, output, 2);
    expect(threads[0].eventIds).toEqual(['e-old-1']);
  });
});
```

- [ ] **Step 2: Run tests — confirm they fail**

```bash
npx vitest run src/postShow/threadMutator.spec.ts 2>&1 | tail -5
```

Expected: `Error: Cannot find module './threadMutator.js'`

- [ ] **Step 3: Implement `src/postShow/threadMutator.ts`**

```typescript
import { randomUUID } from 'node:crypto';
import type { SocialThread, ThreadActorState } from '@org/wrastlin-shared';
import type { ThreadMutationOutput, NewThreadSpec, ThreadUpdateSpec } from './types.js';

function mergeActorStates(
  existing: ThreadActorState[],
  updates: ThreadActorState[],
): ThreadActorState[] {
  const map = new Map(existing.map(a => [a.wrestlerId, a]));
  for (const update of updates) {
    map.set(update.wrestlerId, update);
  }
  return Array.from(map.values());
}

function applyUpdate(thread: SocialThread, spec: ThreadUpdateSpec, week: number): SocialThread {
  return {
    ...thread,
    lastUpdatedWeek: week,
    eventIds: [...thread.eventIds, ...spec.addEventIds],
    actorStates: mergeActorStates(thread.actorStates, spec.updatedActorStates),
  };
}

function createThread(spec: NewThreadSpec, week: number): SocialThread {
  return {
    threadId: randomUUID(),
    title: spec.title,
    subjects: spec.subjects,
    tags: spec.tags,
    createdWeek: week,
    lastUpdatedWeek: week,
    eventIds: spec.eventIds,
    actorStates: spec.actorStates,
  };
}

export function applyThreadMutations(
  existingThreads: SocialThread[],
  output: ThreadMutationOutput,
  week: number,
): SocialThread[] {
  const updateMap = new Map(output.threadUpdates.map(u => [u.threadId, u]));

  const updatedExisting = existingThreads.map(thread => {
    const update = updateMap.get(thread.threadId);
    return update ? applyUpdate(thread, update, week) : thread;
  });

  const newThreads = output.newThreads.map(spec => createThread(spec, week));

  return [...updatedExisting, ...newThreads];
}
```

- [ ] **Step 4: Run tests — confirm they pass**

```bash
npx vitest run src/postShow/threadMutator.spec.ts 2>&1 | tail -5
```

Expected: `Tests  11 passed (11)`

- [ ] **Step 5: Commit**

```bash
git add src/postShow/threadMutator.ts src/postShow/threadMutator.spec.ts
git commit -m "feat(wrastlin): add applyThreadMutations — pure thread merge function"
```

---

## Task 5: Stub agent + prompt template

**Files:**
- Create: `src/postShow/stubThreadMutationAgent.ts`
- Create: `prompts/thread-mutation.md`

No test needed for the stub — trivial implementation.

- [ ] **Step 1: Create `src/postShow/stubThreadMutationAgent.ts`**

```typescript
import type { ThreadMutationAgentFn } from './types.js';

export const stubThreadMutationAgent: ThreadMutationAgentFn = async (_input) => {
  return { newThreads: [], threadUpdates: [] };
};
```

- [ ] **Step 2: Create `prompts/thread-mutation.md`**

```markdown
You are the creative director of a professional wrestling league. Your job is to read
what happened at this week's show and update the ongoing narrative — the feuds, alliances,
rivalries, and personal arcs that define the characters.

## What happened this week (Week {{WEEK}})

These events just occurred at the show. Each event has an ID you must use when linking events to threads.

{{NEW_EVENTS_JSON}}

## Ongoing story threads

These are the active narrative threads from previous weeks. You may update any of these,
or leave them alone if this week's events had nothing to do with them.

{{EXISTING_THREADS_JSON}}

## Wrestler roster

{{WRESTLERS_JSON}}

## Your task

Based on what happened this week, decide:

**1. New threads to create** — Did this week's events start a new story? A new rivalry, a betrayal,
a surprise alliance? Each event can spark multiple threads, or none. Be selective — only create a thread
if there's a genuine narrative arc worth tracking. Not every match result needs a thread.

**2. Existing threads to update** — Did this week's events add to an ongoing story? If so, update the
relevant wrestlers' actorStates (care, stance, summary). You only need to update the wrestlers
directly affected by this week's events — other wrestlers' states remain as-is.

**Rules:**
- `eventIds` in newThreads and `addEventIds` in threadUpdates must come from the event IDs in the "What happened this week" section above — do not invent IDs
- `threadId` in threadUpdates must be an ID from the "Ongoing story threads" section above — do not invent IDs for updates
- `care` is 1–10: how much this thread is consuming this wrestler right now (10 = can't think about anything else)
- `stance` is free-form: e.g. 'aggrieved', 'smug', 'motivated', 'dismissive', 'conflicted', 'vengeful', 'cautious'
- It is fine to return empty arrays for both if nothing from this week meaningfully advances the narrative

Respond with only valid JSON matching this exact schema. No prose, no explanation, no markdown fences.

{
  "newThreads": [
    {
      "title": "short human-readable title e.g. 'Rex vs Steel Conflict'",
      "subjects": ["w-001", "w-002"],
      "tags": ["conflict"],
      "eventIds": ["event-id-from-above"],
      "actorStates": [
        {
          "wrestlerId": "w-001",
          "care": 9,
          "stance": "vengeful",
          "summary": "1-2 sentences: how this wrestler currently sees this thread"
        }
      ]
    }
  ],
  "threadUpdates": [
    {
      "threadId": "existing-thread-id-from-above",
      "addEventIds": ["event-id-from-above"],
      "updatedActorStates": [
        {
          "wrestlerId": "w-002",
          "care": 7,
          "stance": "defensive",
          "summary": "1-2 sentences: updated take on this thread"
        }
      ]
    }
  ]
}
```

- [ ] **Step 3: Commit**

```bash
git add src/postShow/stubThreadMutationAgent.ts prompts/thread-mutation.md
git commit -m "feat(wrastlin): add stubThreadMutationAgent and thread-mutation prompt"
```

---

## Task 6: Real OpenAI agent — TDD

**Files:**
- Create: `src/postShow/openaiThreadMutationAgent.ts`
- Create: `src/postShow/threadMutationAgent.spec.ts`

Pattern mirrors `openaiShowOutlineAgent.ts`. Mock `openai` with `vi.mock`. Set `process.env.PROMPTS_DIR` to point at the real prompts dir.

### Step 1: Write failing tests

- [ ] **Create `src/postShow/threadMutationAgent.spec.ts`**

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import path from 'node:path';
import type { ThreadMutationInput, ThreadMutationOutput } from './types.js';
import { createOpenAIThreadMutationAgent } from './openaiThreadMutationAgent.js';

process.env.PROMPTS_DIR = path.resolve(import.meta.dirname, '../../prompts');

const mockCreate = vi.fn();

vi.mock('openai', () => ({
  default: vi.fn(() => ({
    chat: { completions: { create: mockCreate } },
  })),
}));

const INPUT: ThreadMutationInput = {
  week: 2,
  newEvents: [
    {
      eventId: 'e-001',
      week: 2,
      participants: ['w-001', 'w-002'],
      description: 'Rex Dominion defeated Steel Purity by clean',
      tags: ['match-result', 'singles', 'headliner'],
    },
  ],
  existingThreads: [
    {
      threadId: 't-001',
      title: 'Rex vs Steel Conflict',
      subjects: ['w-001', 'w-002'],
      tags: ['conflict'],
      createdWeek: 1,
      lastUpdatedWeek: 1,
      eventIds: ['e-old-1'],
      actorStates: [
        { wrestlerId: 'w-001', care: 7, stance: 'aggrieved', summary: 'Rex wants revenge' },
      ],
    },
  ],
  wrestlers: [
    { wrestlerId: 'w-001', name: 'Rex Dominion', gimmick: 'The Arrogant Champion' },
    { wrestlerId: 'w-002', name: 'Steel Purity', gimmick: 'The Upright Challenger' },
  ],
};

const VALID_OUTPUT: ThreadMutationOutput = {
  newThreads: [],
  threadUpdates: [
    {
      threadId: 't-001',
      addEventIds: ['e-001'],
      updatedActorStates: [
        { wrestlerId: 'w-001', care: 9, stance: 'dominant', summary: 'Rex proved his dominance' },
        { wrestlerId: 'w-002', care: 8, stance: 'humiliated', summary: 'Steel is hungry for a rematch' },
      ],
    },
  ],
};

beforeEach(() => {
  mockCreate.mockReset();
});

describe('createOpenAIThreadMutationAgent', () => {
  it('returns parsed output from model response', async () => {
    mockCreate.mockResolvedValue({
      choices: [{ message: { content: JSON.stringify(VALID_OUTPUT) } }],
    });
    const agent = createOpenAIThreadMutationAgent('test-key');
    const result = await agent(INPUT);
    expect(result.newThreads).toHaveLength(0);
    expect(result.threadUpdates).toHaveLength(1);
    expect(result.threadUpdates[0].threadId).toBe('t-001');
  });

  it('includes event description in the prompt', async () => {
    mockCreate.mockResolvedValue({
      choices: [{ message: { content: JSON.stringify(VALID_OUTPUT) } }],
    });
    const agent = createOpenAIThreadMutationAgent('test-key');
    await agent(INPUT);
    const prompt: string = mockCreate.mock.calls[0][0].messages[0].content;
    expect(prompt).toContain('Rex Dominion defeated Steel Purity');
  });

  it('includes existing thread title in the prompt', async () => {
    mockCreate.mockResolvedValue({
      choices: [{ message: { content: JSON.stringify(VALID_OUTPUT) } }],
    });
    const agent = createOpenAIThreadMutationAgent('test-key');
    await agent(INPUT);
    const prompt: string = mockCreate.mock.calls[0][0].messages[0].content;
    expect(prompt).toContain('Rex vs Steel Conflict');
  });

  it('includes wrestler name in the prompt', async () => {
    mockCreate.mockResolvedValue({
      choices: [{ message: { content: JSON.stringify(VALID_OUTPUT) } }],
    });
    const agent = createOpenAIThreadMutationAgent('test-key');
    await agent(INPUT);
    const prompt: string = mockCreate.mock.calls[0][0].messages[0].content;
    expect(prompt).toContain('Rex Dominion');
  });

  it('throws when response has no content', async () => {
    mockCreate.mockResolvedValue({ choices: [{ message: { content: null } }] });
    const agent = createOpenAIThreadMutationAgent('test-key');
    await expect(agent(INPUT)).rejects.toThrow();
  });

  it('throws when response is not valid ThreadMutationOutput', async () => {
    mockCreate.mockResolvedValue({
      choices: [{ message: { content: JSON.stringify({ wrong: 'shape' }) } }],
    });
    const agent = createOpenAIThreadMutationAgent('test-key');
    await expect(agent(INPUT)).rejects.toThrow();
  });
});
```

- [ ] **Step 2: Run tests — confirm they fail**

```bash
npx vitest run src/postShow/threadMutationAgent.spec.ts 2>&1 | tail -5
```

Expected: `Error: Cannot find module './openaiThreadMutationAgent.js'`

- [ ] **Step 3: Implement `src/postShow/openaiThreadMutationAgent.ts`**

```typescript
import OpenAI from 'openai';
import { loadPrompt } from '../agents/promptLoader.js';
import type { ThreadMutationAgentFn, ThreadMutationInput, ThreadMutationOutput } from './types.js';

function buildVariables(input: ThreadMutationInput): Record<string, string> {
  return {
    WEEK: String(input.week),
    NEW_EVENTS_JSON: JSON.stringify(input.newEvents, null, 2),
    EXISTING_THREADS_JSON: JSON.stringify(input.existingThreads, null, 2),
    WRESTLERS_JSON: JSON.stringify(input.wrestlers, null, 2),
  };
}

function isThreadMutationOutput(val: unknown): val is ThreadMutationOutput {
  if (!val || typeof val !== 'object') return false;
  const obj = val as Record<string, unknown>;
  return Array.isArray(obj.newThreads) && Array.isArray(obj.threadUpdates);
}

function extractJson(text: string): string {
  return text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
}

export function createOpenAIThreadMutationAgent(apiKey: string): ThreadMutationAgentFn {
  const client = new OpenAI({ apiKey });

  return async (input: ThreadMutationInput): Promise<ThreadMutationOutput> => {
    const prompt = loadPrompt('thread-mutation.md', buildVariables(input));

    const response = await client.chat.completions.create({
      model: 'gpt-4o',
      max_tokens: 2048,
      messages: [{ role: 'user', content: prompt }],
    });

    const text = response.choices[0]?.message?.content ?? '';
    if (!text) throw new Error('No content in thread mutation response');

    const parsed: unknown = JSON.parse(extractJson(text));

    if (!isThreadMutationOutput(parsed)) {
      throw new Error(`Response does not match ThreadMutationOutput schema: ${text.slice(0, 200)}`);
    }

    return parsed;
  };
}
```

- [ ] **Step 4: Run tests — confirm they pass**

```bash
npx vitest run src/postShow/threadMutationAgent.spec.ts 2>&1 | tail -5
```

Expected: `Tests  6 passed (6)`

- [ ] **Step 5: Full suite check**

```bash
cd /Users/tawneypauling/Documents/git/social-games/.worktrees/shared-auth && pnpm nx test wrastlin-service --skip-nx-cache 2>&1 | grep -E "Test Files|Tests "
```

Expected: only the pre-existing judgeAgent failure; all other tests pass.

- [ ] **Step 6: Commit**

```bash
git add src/postShow/openaiThreadMutationAgent.ts src/postShow/threadMutationAgent.spec.ts
git commit -m "feat(wrastlin): add openaiThreadMutationAgent"
```

---

## Task 7: Orchestrator + CLI

**Files:**
- Create: `src/postShow/applyPostShowUpdates.ts`
- Create: `src/run-post-show.ts`

The orchestrator coordinates all three stages. It loads and saves state — no tests needed (coordination only, same pattern as `applyPayouts.ts`).

- [ ] **Step 1: Create `src/postShow/applyPostShowUpdates.ts`**

```typescript
import fs from 'node:fs';
import path from 'node:path';
import { loadWrestlers, saveWrestlers, loadThreads, saveThreads, loadEvents, saveEvents } from '../core/gameState.js';
import { extractEvents } from './eventExtractor.js';
import { applyEmotionalStateUpdates } from './emotionalStateUpdater.js';
import { applyThreadMutations } from './threadMutator.js';
import type { ThreadMutationAgentFn } from './types.js';
import type { GeneratedShow } from '../agents/types.js';

const SHOWS_DIR = path.resolve(
  new URL(import.meta.url).pathname,
  '../../data/shows',  // resolved at runtime relative to compiled file location
);

function loadShow(week: number): GeneratedShow {
  // Resolve relative to the meta-service root using import.meta.dirname
  const showPath = path.resolve(import.meta.dirname, `../data/shows/week-${week}.json`);
  if (!fs.existsSync(showPath)) {
    throw new Error(`Show file not found: ${showPath} — run generate-show first`);
  }
  return JSON.parse(fs.readFileSync(showPath, 'utf-8')) as GeneratedShow;
}

export async function applyPostShowUpdates(options: {
  week: number;
  agent: ThreadMutationAgentFn;
}): Promise<void> {
  const { week, agent } = options;

  console.log(`\n=== POST-SHOW UPDATES FOR WEEK ${week} ===`);

  const show = loadShow(week);
  const wrestlers = loadWrestlers();
  const existingThreads = loadThreads();
  const existingEvents = loadEvents();

  // Stage 1: Extract narrative events from the show
  const nameMap = new Map(wrestlers.map(w => [w.wrestlerId, w.name]));
  const newEvents = extractEvents(show, week, nameMap);
  console.log(`\nStage 1 — Event extraction: ${newEvents.length} new event(s)`);
  newEvents.forEach(e => console.log(`  [${e.tags.join(', ')}] ${e.description}`));

  // Stage 2: Mutate threads via AI agent
  const wrestlerRoster = wrestlers.map(w => ({
    wrestlerId: w.wrestlerId,
    name: w.name,
    gimmick: w.gimmick,
  }));
  console.log('\nStage 2 — Thread mutation (AI)...');
  const mutationOutput = await agent({ week, newEvents, existingThreads, wrestlers: wrestlerRoster });
  console.log(`  Created ${mutationOutput.newThreads.length} new thread(s)`);
  console.log(`  Updated ${mutationOutput.threadUpdates.length} existing thread(s)`);

  const updatedThreads = applyThreadMutations(existingThreads, mutationOutput, week);

  // Stage 3: Apply emotional state changes
  console.log('\nStage 3 — Emotional state updates');
  const updatedWrestlers = applyEmotionalStateUpdates(wrestlers, show);
  const changed = updatedWrestlers.filter((w, i) =>
    JSON.stringify(w.emotionalState) !== JSON.stringify(wrestlers[i].emotionalState)
  );
  changed.forEach(w => {
    const orig = wrestlers.find(o => o.wrestlerId === w.wrestlerId)!;
    console.log(`  ${w.name}: confidence ${orig.emotionalState.confidence}→${w.emotionalState.confidence}, frustration ${orig.emotionalState.frustration}→${w.emotionalState.frustration}`);
  });

  // Save all changes
  saveEvents([...existingEvents, ...newEvents]);
  saveThreads(updatedThreads);
  saveWrestlers(updatedWrestlers);

  console.log(`\nSaved: ${newEvents.length} events, ${updatedThreads.length} threads, ${changed.length} wrestler state changes`);
}
```

- [ ] **Step 2: Create `src/run-post-show.ts`**

```typescript
import { loadState } from './core/gameState.js';
import { stubThreadMutationAgent } from './postShow/stubThreadMutationAgent.js';
import { createOpenAIThreadMutationAgent } from './postShow/openaiThreadMutationAgent.js';
import { applyPostShowUpdates } from './postShow/applyPostShowUpdates.js';

const args = process.argv.slice(2);
const useStub = args.includes('--stub');

const weekIndex = args.indexOf('--week');
const week = weekIndex !== -1
  ? parseInt(args[weekIndex + 1], 10)
  : loadState().currentWeek;

if (!useStub && !process.env.OPENAI_API_KEY) {
  console.error('OPENAI_API_KEY env var is required when not using --stub');
  process.exit(1);
}

const agent = useStub
  ? stubThreadMutationAgent
  : createOpenAIThreadMutationAgent(process.env.OPENAI_API_KEY!);

applyPostShowUpdates({ week, agent }).catch(err => {
  console.error('Error:', err instanceof Error ? err.message : String(err));
  process.exit(1);
});
```

- [ ] **Step 3: Run a quick smoke test in stub mode**

First make sure state.json exists in the worktree (copy from main if not):

```bash
ls apps/wrastlin/meta-service/data/runtime/state.json 2>/dev/null || \
  cp /Users/tawneypauling/Documents/git/social-games/apps/wrastlin/meta-service/data/runtime/state.json \
     apps/wrastlin/meta-service/data/runtime/state.json
```

Then generate a show so week-N.json exists:

```bash
cd /Users/tawneypauling/Documents/git/social-games/.worktrees/shared-auth && \
  pnpm nx run wrastlin-service:generate-show -- --stub --force --skip-tts 2>&1 | tail -5
```

Then verify the CLI compiles and runs (build not wired yet, so invoke directly via ts-node approach — actually we need to build first. Skip until Task 8 wires the build, then come back here):

> **Note:** Full CLI smoke test is done at the end of Task 8 after build wiring is complete.

- [ ] **Step 4: Commit**

```bash
git add src/postShow/applyPostShowUpdates.ts src/run-post-show.ts
git commit -m "feat(wrastlin): add applyPostShowUpdates orchestrator and run-post-show CLI"
```

---

## Task 8: Build wiring + NX target

**Files:**
- Modify: `scripts/build.cjs` (lines 44–69)
- Modify: `project.json`

- [ ] **Step 1: Add `run-post-show` to `scripts/build.cjs`**

Update the `runEntries` array and console.log (the log string is hardcoded — update it to reflect the new entry):

```javascript
// Current (lines 44–50):
const runEntries = [
  'run-open-betting',
  'run-close-betting',
  'run-judge',
  'run-resolve-proposition',
  'run-apply-payouts',
];

// Replace with:
const runEntries = [
  'run-open-betting',
  'run-close-betting',
  'run-judge',
  'run-resolve-proposition',
  'run-apply-payouts',
  'run-post-show',
];
```

The `console.log` at line 69 dynamically lists the runEntries so it will update automatically.

- [ ] **Step 2: Add `apply-post-show-updates` target to `project.json`**

Add this block inside the `"targets"` object, after the `"apply-payouts"` target:

```json
"apply-post-show-updates": {
  "executor": "nx:run-commands",
  "options": {
    "command": "node scripts/build.cjs && node --env-file=.env dist/run-post-show.js",
    "cwd": "apps/wrastlin/meta-service"
  }
}
```

- [ ] **Step 3: Verify build succeeds**

```bash
cd /Users/tawneypauling/Documents/git/social-games/.worktrees/shared-auth && \
  pnpm nx run wrastlin-service:build 2>&1 | tail -5
```

Expected: `Build complete: dist/main.js, dist/generate-show.js, dist/run-open-betting.js, ... dist/run-post-show.js`

- [ ] **Step 4: End-to-end stub run**

```bash
pnpm nx run wrastlin-service:generate-show -- --stub --force --skip-tts 2>&1 | tail -3
pnpm nx run wrastlin-service:apply-post-show-updates -- --stub 2>&1
```

Expected output from the second command:
```
=== POST-SHOW UPDATES FOR WEEK 1 ===

Stage 1 — Event extraction: N new event(s)
  [match-result, singles] Rex Dominion defeated Steel Purity by clean
  ...

Stage 2 — Thread mutation (AI)...
  Created 0 new thread(s)
  Updated 0 existing thread(s)

Stage 3 — Emotional state updates
  Rex Dominion: confidence 5→6, frustration 5→4
  ...

Saved: N events, 0 threads, N wrestler state changes
```

- [ ] **Step 5: Full test suite**

```bash
pnpm nx test wrastlin-service --skip-nx-cache 2>&1 | grep -E "Test Files|Tests "
```

Expected: only the pre-existing judgeAgent failure; all other tests pass.

- [ ] **Step 6: Commit**

```bash
git add scripts/build.cjs project.json
git commit -m "feat(wrastlin): wire run-post-show into build and add apply-post-show-updates NX target"
```

---

## Self-Review

**Spec coverage:**

| Requirement | Task |
|-------------|------|
| Event extraction from show JSON — match result | Task 2 |
| Event extraction — interference | Task 2 |
| Event extraction — promo callout | Task 2 |
| Thread creation (AI decides, no fixed rules) | Tasks 5, 6 |
| Thread update — existing threads get new events + actor states | Tasks 4, 6 |
| One event can spawn multiple threads | Prompt (Task 5) — agent decides |
| Emotional state update — winner confidence+1, frustration-1 | Task 3 |
| Emotional state update — loser confidence-1, frustration+1 | Task 3 |
| Clamped 1–10 | Task 3 |
| `--stub` bypasses AI | Tasks 5, 7 |
| CLI target `apply-post-show-updates` | Task 8 |
| Reads show from `data/shows/week-N.json` | Task 7 |
| Saves to events.json, threads.json, wrestlers.json | Task 7 |

**Type consistency check:**
- `ThreadMutationAgentFn` defined in Task 1, used in Tasks 5, 6, 7 ✓
- `ThreadMutationOutput.newThreads: NewThreadSpec[]` — defined Task 1, consumed Task 4 ✓
- `ThreadMutationOutput.threadUpdates: ThreadUpdateSpec[]` — defined Task 1, consumed Task 4 ✓
- `ThreadUpdateSpec.updatedActorStates` (not `actorStates`) — used consistently in Tasks 4, 6 ✓
- `extractEvents(show, week, nameMap)` — defined Task 2, called Task 7 ✓
- `applyEmotionalStateUpdates(wrestlers, show)` — defined Task 3, called Task 7 ✓
- `applyThreadMutations(existingThreads, output, week)` — defined Task 4, called Task 7 ✓

**Does NOT do (intentionally out of scope):**
- Care decay — threads not touched this week do not auto-decay (separate future feature)
- `managerTrust` updates
- Promo self-hype events (only callouts generate events)
- Tag-team match results (participants.flat() handles this correctly — winner is still a single wrestlerId)
