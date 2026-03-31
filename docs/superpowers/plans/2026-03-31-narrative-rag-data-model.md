# Narrative RAG — Data Model Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace `Wrestler.memories[]` and `Wrestler.relationships[]` with a centralized `NarrativeEvent` / `SocialThread` system and wire in persistence for both.

**Architecture:** Two new shared types (`NarrativeEvent`, `SocialThread`) are stored in flat JSON files (`events.json`, `threads.json`) in the runtime data dir. The `Wrestler` type loses `memories` and `relationships` — a clean break. All downstream code that referenced those fields is updated or removed; the retrieval layer that will eventually replace them is out of scope here.

**Tech Stack:** TypeScript, Fastify (meta-service), Vitest, pnpm/nx monorepo (`@org/wrastlin-shared` shared lib).

---

## File Map

| Action | File | Responsibility |
|--------|------|----------------|
| Create | `libs/wrastlin/shared/src/types/narrative-event.ts` | `NarrativeEvent` interface |
| Create | `libs/wrastlin/shared/src/types/social-thread.ts` | `ThreadActorState` + `SocialThread` interfaces |
| Modify | `libs/wrastlin/shared/src/index.ts` | Export new types |
| Modify | `libs/wrastlin/shared/src/types/wrestler.ts` | Remove `memories[]`, `relationships[]`, delete `Memory`/`Relationship`/`MemoryType` |
| Modify | `apps/wrastlin/meta-service/src/core/gameState.ts` | Add `loadEvents`/`saveEvents`/`loadThreads`/`saveThreads` |
| Modify | `apps/wrastlin/meta-service/src/core/gameState.spec.ts` | Round-trip tests for new persistence functions |
| Modify | `apps/wrastlin/meta-service/src/agents/types.ts` | Remove `Memory[]` from `ParticipantForPromo` + `TargetForPromo` |
| Modify | `apps/wrastlin/meta-service/src/agents/dataBuilders.ts` | Remove memory filtering from `buildPromoScreenplayInput`, drop `currentWeek` param |
| Modify | `apps/wrastlin/meta-service/src/agents/pipeline.ts` | Remove `showOutlineInput.week` arg from `buildPromoScreenplayInput` call |
| Modify | `apps/wrastlin/meta-service/src/agents/dataBuilders.spec.ts` | Drop `memories`/`relationships` from fixtures; replace memory tests; drop `currentWeek` args |
| Modify | `apps/wrastlin/meta-service/src/agents/pipeline.spec.ts` | Drop `memories`/`relationships` from wrestler fixture |
| Modify | `apps/wrastlin/meta-service/src/api/wrestlers.spec.ts` | Drop `memories`/`relationships` from wrestler fixture |
| Modify | `apps/wrastlin/meta-service/src/storyteller/matchResolver.spec.ts` | Drop `memories`/`relationships` from wrestler fixture |
| Modify | `apps/wrastlin/meta-service/src/storyteller/showGenerator.spec.ts` | Drop `memories`/`relationships` from wrestler fixture |
| Modify | `apps/wrastlin/meta-service/src/wrestlers/wrestlerState.spec.ts` | Drop `memories`/`relationships` from wrestler fixture |
| Modify | `apps/wrastlin/meta-service/src/betting/judgeAgent.spec.ts` | Drop `memories`/`relationships` from wrestler fixture |
| Modify | `apps/wrastlin/meta-service/data/static/wrestlers.json` | Strip `memories` and `relationships` from each wrestler entry |

---

## Task 1: Define NarrativeEvent and SocialThread types

**Files:**
- Create: `libs/wrastlin/shared/src/types/narrative-event.ts`
- Create: `libs/wrastlin/shared/src/types/social-thread.ts`
- Modify: `libs/wrastlin/shared/src/index.ts`

- [ ] **Step 1: Create narrative-event.ts**

```typescript
// libs/wrastlin/shared/src/types/narrative-event.ts
export interface NarrativeEvent {
  eventId: string;
  week: number;
  participants: string[];  // wrestlerIds involved
  description: string;     // e.g. "Steel interfered in Rex's title match"
  tags: string[];          // free-form e.g. ['interference', 'title', 'public']
}
```

- [ ] **Step 2: Create social-thread.ts**

```typescript
// libs/wrastlin/shared/src/types/social-thread.ts
export interface ThreadActorState {
  wrestlerId: string;
  care: number;    // 1–10; how much this thread is on their mind; decays over time
  stance: string;  // free-form e.g. 'aggrieved', 'dismissive', 'motivated', 'grateful'
  summary: string; // prose: wrestler's current interpretation e.g. "Rex sees this as unfinished business"
}

export interface SocialThread {
  threadId: string;
  title: string;                    // human-readable e.g. "Rex vs Steel Conflict"; set at creation
  subjects: string[];               // wrestlerIds — main wrestlers involved
  tags: string[];                   // free-form e.g. ['conflict', 'betrayal', 'title']
  createdWeek: number;
  lastUpdatedWeek: number;
  eventIds: string[];               // references to NarrativeEvent.eventId
  actorStates: ThreadActorState[];  // one entry per involved wrestler; care is per-wrestler
}
```

- [ ] **Step 3: Export from shared index**

In `libs/wrastlin/shared/src/index.ts`, add two lines after the existing exports:

```typescript
export * from './types/narrative-event.js';
export * from './types/social-thread.js';
```

- [ ] **Step 4: Commit**

```bash
git add libs/wrastlin/shared/src/types/narrative-event.ts \
        libs/wrastlin/shared/src/types/social-thread.ts \
        libs/wrastlin/shared/src/index.ts
git commit -m "feat(wrastlin): add NarrativeEvent and SocialThread shared types"
```

---

## Task 2: TDD persistence for events and threads

**Files:**
- Modify: `apps/wrastlin/meta-service/src/core/gameState.spec.ts`
- Modify: `apps/wrastlin/meta-service/src/core/gameState.ts`

- [ ] **Step 1: Write failing tests**

Append to `apps/wrastlin/meta-service/src/core/gameState.spec.ts`:

```typescript
import type { NarrativeEvent, SocialThread } from '@org/wrastlin-shared';

describe('loadEvents / saveEvents', () => {
  let tmpDir: string;

  beforeEach(() => {
    vi.resetModules();
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wrastlin-events-test-'));
    process.env.DYNAMIC_DATA_DIR = tmpDir;
  });

  afterEach(() => {
    delete process.env.DYNAMIC_DATA_DIR;
    fs.rmSync(tmpDir, { recursive: true });
  });

  it('round-trips events through save and load', async () => {
    const { loadEvents, saveEvents } = await import('./gameState.js');
    const events: NarrativeEvent[] = [
      {
        eventId: 'e-001',
        week: 1,
        participants: ['w-001', 'w-002'],
        description: 'Steel interfered in Rex\'s match',
        tags: ['interference', 'public'],
      },
    ];
    saveEvents(events);
    expect(loadEvents()).toEqual(events);
  });

  it('returns empty array when events.json does not exist', async () => {
    const { loadEvents } = await import('./gameState.js');
    expect(loadEvents()).toEqual([]);
  });
});

describe('loadThreads / saveThreads', () => {
  let tmpDir: string;

  beforeEach(() => {
    vi.resetModules();
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wrastlin-threads-test-'));
    process.env.DYNAMIC_DATA_DIR = tmpDir;
  });

  afterEach(() => {
    delete process.env.DYNAMIC_DATA_DIR;
    fs.rmSync(tmpDir, { recursive: true });
  });

  it('round-trips threads through save and load', async () => {
    const { loadThreads, saveThreads } = await import('./gameState.js');
    const threads: SocialThread[] = [
      {
        threadId: 't-001',
        title: 'Rex vs Steel Conflict',
        subjects: ['w-001', 'w-002'],
        tags: ['conflict', 'public'],
        createdWeek: 1,
        lastUpdatedWeek: 1,
        eventIds: ['e-001'],
        actorStates: [
          { wrestlerId: 'w-001', care: 8, stance: 'aggrieved', summary: 'Rex sees this as unfinished business' },
          { wrestlerId: 'w-002', care: 3, stance: 'dismissive', summary: 'Purity barely remembers the incident' },
        ],
      },
    ];
    saveThreads(threads);
    expect(loadThreads()).toEqual(threads);
  });

  it('returns empty array when threads.json does not exist', async () => {
    const { loadThreads } = await import('./gameState.js');
    expect(loadThreads()).toEqual([]);
  });
});
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
pnpm nx test wrastlin-service -- --reporter=verbose 2>&1 | grep -E "loadEvents|loadThreads|saveEvents|saveThreads"
```

Expected: 4 tests failing with `loadEvents is not a function` (or similar).

- [ ] **Step 3: Implement persistence functions**

In `apps/wrastlin/meta-service/src/core/gameState.ts`:

Add to the imports at the top:
```typescript
import type { Wrestler, Manager, WeeklyState, WeeklySubmission, Announcer, NarrativeEvent, SocialThread } from '@org/wrastlin-shared';
```

Append to the bottom of the file:
```typescript
export function loadEvents(): NarrativeEvent[] {
  try {
    return readDynamicJson<NarrativeEvent[]>('events.json');
  } catch {
    return [];
  }
}

export function saveEvents(events: NarrativeEvent[]): void {
  writeDynamicJson('events.json', events);
}

export function loadThreads(): SocialThread[] {
  try {
    return readDynamicJson<SocialThread[]>('threads.json');
  } catch {
    return [];
  }
}

export function saveThreads(threads: SocialThread[]): void {
  writeDynamicJson('threads.json', threads);
}
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
pnpm nx test wrastlin-service -- --reporter=verbose 2>&1 | grep -E "loadEvents|loadThreads|saveEvents|saveThreads"
```

Expected: 4 tests passing.

- [ ] **Step 5: Confirm full suite is still green**

```bash
pnpm nx test wrastlin-service 2>&1 | tail -5
```

Expected: all tests pass.

- [ ] **Step 6: Commit**

```bash
git add apps/wrastlin/meta-service/src/core/gameState.ts \
        apps/wrastlin/meta-service/src/core/gameState.spec.ts
git commit -m "feat(wrastlin): add loadEvents/saveEvents/loadThreads/saveThreads persistence"
```

---

## Task 3: Remove memories and relationships — clean break

**Files:**
- Modify: `libs/wrastlin/shared/src/types/wrestler.ts`
- Modify: `apps/wrastlin/meta-service/src/agents/types.ts`
- Modify: `apps/wrastlin/meta-service/src/agents/dataBuilders.ts`
- Modify: `apps/wrastlin/meta-service/src/agents/pipeline.ts`
- Modify: `apps/wrastlin/meta-service/src/agents/dataBuilders.spec.ts`
- Modify: `apps/wrastlin/meta-service/src/agents/pipeline.spec.ts`
- Modify: `apps/wrastlin/meta-service/src/api/wrestlers.spec.ts`
- Modify: `apps/wrastlin/meta-service/src/storyteller/matchResolver.spec.ts`
- Modify: `apps/wrastlin/meta-service/src/storyteller/showGenerator.spec.ts`
- Modify: `apps/wrastlin/meta-service/src/wrestlers/wrestlerState.spec.ts`
- Modify: `apps/wrastlin/meta-service/src/betting/judgeAgent.spec.ts`

The "red" signal for this task is running the test suite after updating `wrestler.ts` — any code that accesses `w.memories` or `w.relationships` at runtime (like `dataBuilders.ts`) will throw `TypeError: Cannot read properties of undefined`.

- [ ] **Step 1: Update the Wrestler shared type**

Replace the entire contents of `libs/wrastlin/shared/src/types/wrestler.ts` with:

```typescript
export interface WrestlerStats {
  strength: number;   // 1-100
  agility: number;
  endurance: number;
  charisma: number;
}

export interface WrestlerPersonality {
  ego: number;        // 1-10
  anger: number;
  honor: number;
  loyalty: number;
  ambition: number;
}

export interface WrestlerEmotions {
  confidence: number; // 1-10
  frustration: number;
  fatigue: number;
}

export interface Wrestler {
  wrestlerId: string;
  name: string;
  gimmick: string;
  stats: WrestlerStats;
  personality: WrestlerPersonality;
  emotionalState: WrestlerEmotions;
  managerTrust: number; // 1-10
  finisher: string;
}
```

(`Relationship`, `Memory`, `MemoryType` interfaces removed entirely.)

- [ ] **Step 2: Run tests to confirm the right things break**

```bash
pnpm nx test wrastlin-service -- --reporter=verbose 2>&1 | grep -E "×|FAIL" | head -20
```

Expected: tests in `dataBuilders.spec.ts` that call `buildPromoScreenplayInput` fail with a `TypeError` because `w.memories` is now `undefined` at runtime.

- [ ] **Step 3: Update agents/types.ts — remove Memory[] from promo types**

In `apps/wrastlin/meta-service/src/agents/types.ts`, replace `ParticipantForPromo` and `TargetForPromo`:

```typescript
export interface ParticipantForPromo {
  wrestlerId: string;
  name: string;
  gimmick: string;
  personality: WrestlerPersonality;
  emotionalState: WrestlerEmotions;
}

export interface TargetForPromo {
  wrestlerId: string;
  name: string;
  gimmick: string;
  personality: WrestlerPersonality;
}
```

Also remove the `Memory` import from `@org/wrastlin-shared` at the top of the file. The import line currently reads:

```typescript
import type {
  WrestlerStats,
  WrestlerPersonality,
  WrestlerEmotions,
  Memory,
  Announcer,
} from '@org/wrastlin-shared';
```

Change it to:

```typescript
import type {
  WrestlerStats,
  WrestlerPersonality,
  WrestlerEmotions,
  Announcer,
} from '@org/wrastlin-shared';
```

- [ ] **Step 4: Update dataBuilders.ts — remove memory filtering and currentWeek param**

Replace `buildPromoScreenplayInput` in `apps/wrastlin/meta-service/src/agents/dataBuilders.ts`:

```typescript
export function buildPromoScreenplayInput(
  segment: PromoOutlineSegment,
  allWrestlers: Wrestler[],
  personas: Announcer[],
): PromoScreenplayInput {
  const participants: ParticipantForPromo[] = segment.participants
    .map(id => {
      const w = allWrestlers.find(wr => wr.wrestlerId === id);
      if (!w) return null;
      return {
        wrestlerId: w.wrestlerId,
        name: w.name,
        gimmick: w.gimmick,
        personality: w.personality,
        emotionalState: w.emotionalState,
      };
    })
    .filter((p): p is ParticipantForPromo => p !== null);

  let target: TargetForPromo | null = null;
  if (segment.target) {
    const targetWrestler = allWrestlers.find(w => w.wrestlerId === segment.target);
    if (targetWrestler) {
      target = {
        wrestlerId: targetWrestler.wrestlerId,
        name: targetWrestler.name,
        gimmick: targetWrestler.gimmick,
        personality: targetWrestler.personality,
      };
    }
  }

  return { segment, participants, target, personas };
}
```

- [ ] **Step 5: Update pipeline.ts — remove currentWeek arg**

In `apps/wrastlin/meta-service/src/agents/pipeline.ts`, update the `buildPromoScreenplayInput` call:

```typescript
const input = buildPromoScreenplayInput(
  segment,
  wrestlers,
  announcers,
);
```

- [ ] **Step 6: Update dataBuilders.spec.ts**

Make these changes to `apps/wrastlin/meta-service/src/agents/dataBuilders.spec.ts`:

**a) Fix `makeWrestler` — remove the `relationships` parameter and both fields:**

```typescript
function makeWrestler(id: string): Wrestler {
  return {
    wrestlerId: id,
    name: `Wrestler ${id}`,
    gimmick: 'Test Gimmick',
    stats: { strength: 70, agility: 70, endurance: 70, charisma: 70 },
    personality: { ego: 5, anger: 5, honor: 5, loyalty: 5, ambition: 5 },
    emotionalState: { confidence: 5, frustration: 5, fatigue: 5 },
    managerTrust: 5,
    finisher: 'Test Finisher',
  };
}
```

**b) Fix `computeRivalryHeat` tests** — these relied on `relationships` being passed into `makeWrestler`. Since `relationships` is gone from the Wrestler type, `computeRivalryHeat` needs to be reconsidered. Check whether `computeRivalryHeat` still exists in `dataBuilders.ts` — if it references `wrestler.relationships`, it will need to be removed or updated. If it no longer has inputs to work with, remove both the function and its tests.

Look at the current `computeRivalryHeat` implementation:

```typescript
export function computeRivalryHeat(wrestlers: Wrestler[], a: string, b: string): number {
  const aHatesB = wrestlers
    .find(w => w.wrestlerId === a)
    ?.relationships.find(r => r.wrestlerId === b)?.hatred ?? 0;
  const bHatesA = wrestlers
    .find(w => w.wrestlerId === b)
    ?.relationships.find(r => r.wrestlerId === a)?.hatred ?? 0;
  return Math.round((aHatesB + bHatesA) / 2);
}
```

This function references `wrestler.relationships` which no longer exists. **Delete `computeRivalryHeat`** from `dataBuilders.ts` and delete the corresponding `describe('computeRivalryHeat', ...)` block from `dataBuilders.spec.ts`.

Also check if `computeRivalryHeat` is used in `buildShowOutlineInput`. It is — in `dataBuilders.ts` look for the `rivalryHeat` map on wrestler summaries. Since `relationships` is gone, remove the `rivalryHeat` field from `WrestlerSummaryForOutline` in `agents/types.ts` and remove the corresponding mapping code in `buildShowOutlineInput`.

**c) Fix `buildShowOutlineInput` test** — remove the rivalry heat assertion:

Replace the test `'includes a rivalryHeat map on each wrestler'` with a test that just confirms the wrestler summary is built correctly without `rivalryHeat`:

```typescript
it('maps each wrestler into a summary', () => {
  const wrestlers = [makeWrestler('w-001'), makeWrestler('w-002')];
  const result = buildShowOutlineInput(1, wrestlers, [], [], []);
  expect(result.wrestlers).toHaveLength(2);
  expect(result.wrestlers[0].wrestlerId).toBe('w-001');
});
```

**d) Fix `buildPromoScreenplayInput` tests** — remove the memory tests, drop `currentWeek` arg, replace with simple structural tests:

```typescript
describe('buildPromoScreenplayInput', () => {
  it('maps participants from the segment', () => {
    const wrestlers = [makeWrestler('w-001'), makeWrestler('w-002')];
    const result = buildPromoScreenplayInput(SAMPLE_PROMO_SEGMENT, wrestlers, SAMPLE_ANNOUNCERS);
    expect(result.participants.map(p => p.wrestlerId)).toEqual(['w-001']);
  });

  it('returns target when segment has a target', () => {
    const wrestlers = [makeWrestler('w-001'), makeWrestler('w-002')];
    const result = buildPromoScreenplayInput(SAMPLE_PROMO_SEGMENT, wrestlers, SAMPLE_ANNOUNCERS);
    expect(result.target).not.toBeNull();
    expect(result.target!.wrestlerId).toBe('w-002');
  });

  it('returns null target for self-hype promos', () => {
    const promoNoTarget: PromoOutlineSegment = { ...SAMPLE_PROMO_SEGMENT, target: undefined };
    const wrestlers = [makeWrestler('w-001')];
    const result = buildPromoScreenplayInput(promoNoTarget, wrestlers, SAMPLE_ANNOUNCERS);
    expect(result.target).toBeNull();
  });
});
```

- [ ] **Step 7: Fix WrestlerSummaryForOutline in agents/types.ts**

Remove `rivalryHeat` from `WrestlerSummaryForOutline`:

```typescript
export interface WrestlerSummaryForOutline {
  wrestlerId: string;
  name: string;
  gimmick: string;
  emotionalState: WrestlerEmotions;
}
```

- [ ] **Step 8: Fix buildShowOutlineInput in dataBuilders.ts**

Remove the `computeRivalryHeat` call and `rivalryHeat` map. The `wrestlerSummaries` mapping becomes:

```typescript
const wrestlerSummaries: WrestlerSummaryForOutline[] = wrestlers.map(w => ({
  wrestlerId: w.wrestlerId,
  name: w.name,
  gimmick: w.gimmick,
  emotionalState: w.emotionalState,
}));
```

- [ ] **Step 9: Fix all remaining spec fixtures**

In each of these files, remove `relationships: []` and `memories: []` from every wrestler fixture object. The wrestler fixture should only include: `wrestlerId`, `name`, `gimmick`, `stats`, `personality`, `emotionalState`, `managerTrust`, `finisher`.

Files to update:
- `apps/wrastlin/meta-service/src/agents/pipeline.spec.ts` (line 28–29)
- `apps/wrastlin/meta-service/src/api/wrestlers.spec.ts` (lines 14–15)
- `apps/wrastlin/meta-service/src/storyteller/matchResolver.spec.ts` (lines 12–13)
- `apps/wrastlin/meta-service/src/storyteller/showGenerator.spec.ts` (line 12, 19)
- `apps/wrastlin/meta-service/src/wrestlers/wrestlerState.spec.ts` (lines 13–14)
- `apps/wrastlin/meta-service/src/betting/judgeAgent.spec.ts` (lines 39–40)

- [ ] **Step 10: Run full test suite and confirm green**

```bash
pnpm nx test wrastlin-service -- --reporter=verbose 2>&1 | tail -10
```

Expected: all tests pass. If any fail, the error message will point to the exact reference still using `memories` or `relationships`.

- [ ] **Step 11: Commit**

```bash
git add libs/wrastlin/shared/src/types/wrestler.ts \
        apps/wrastlin/meta-service/src/agents/types.ts \
        apps/wrastlin/meta-service/src/agents/dataBuilders.ts \
        apps/wrastlin/meta-service/src/agents/pipeline.ts \
        apps/wrastlin/meta-service/src/agents/dataBuilders.spec.ts \
        apps/wrastlin/meta-service/src/agents/pipeline.spec.ts \
        apps/wrastlin/meta-service/src/api/wrestlers.spec.ts \
        apps/wrastlin/meta-service/src/storyteller/matchResolver.spec.ts \
        apps/wrastlin/meta-service/src/storyteller/showGenerator.spec.ts \
        apps/wrastlin/meta-service/src/wrestlers/wrestlerState.spec.ts \
        apps/wrastlin/meta-service/src/betting/judgeAgent.spec.ts
git commit -m "feat(wrastlin): clean break — remove memories and relationships from Wrestler"
```

---

## Task 4: Strip wrestlers.json static data

**Files:**
- Modify: `apps/wrastlin/meta-service/data/static/wrestlers.json`

- [ ] **Step 1: Remove memories and relationships from every wrestler entry**

Open `apps/wrastlin/meta-service/data/static/wrestlers.json`. For each of the 6 wrestler objects, delete the `"relationships"` and `"memories"` keys entirely.

Each wrestler entry should end up with only these keys:
`wrestlerId`, `name`, `gimmick`, `stats`, `personality`, `emotionalState`, `managerTrust`, `finisher`.

- [ ] **Step 2: Run tests to confirm nothing broke**

```bash
pnpm nx test wrastlin-service 2>&1 | tail -5
```

Expected: all tests pass.

- [ ] **Step 3: Commit**

```bash
git add apps/wrastlin/meta-service/data/static/wrestlers.json
git commit -m "chore(wrastlin): strip memories and relationships from wrestlers.json"
```

---

## Self-Review

**Spec coverage:**
- ✅ `NarrativeEvent` type — Task 1
- ✅ `SocialThread` + `ThreadActorState` types — Task 1
- ✅ `title` field on `SocialThread` — Task 1, Step 2
- ✅ Exports from shared index — Task 1, Step 3
- ✅ `loadEvents`/`saveEvents`/`loadThreads`/`saveThreads` — Task 2
- ✅ Round-trip tests for persistence — Task 2, Steps 1–4
- ✅ Remove `memories[]` and `relationships[]` from `Wrestler` — Task 3, Step 1
- ✅ Remove `Memory`/`Relationship`/`MemoryType` interfaces — Task 3, Step 1
- ✅ Remove `Memory[]` from `ParticipantForPromo` + `TargetForPromo` — Task 3, Steps 3, 7
- ✅ Remove memory filtering from `buildPromoScreenplayInput` — Task 3, Step 4
- ✅ Fix `dataBuilders.spec.ts` fixtures and tests — Task 3, Step 6
- ✅ Fix all other spec fixtures — Task 3, Step 9
- ✅ Strip `wrestlers.json` — Task 4

**Type consistency check:**
- `NarrativeEvent` defined in Task 1, imported in Task 2 tests and gameState.ts — consistent
- `SocialThread` defined in Task 1, imported in Task 2 tests and gameState.ts — consistent
- `WrestlerSummaryForOutline` updated in Task 3 Step 7, `buildShowOutlineInput` updated in Task 3 Step 8 — consistent
- `buildPromoScreenplayInput` signature changed in Task 3 Step 4, call site updated in Task 3 Step 5, tests updated in Task 3 Step 6d — consistent
