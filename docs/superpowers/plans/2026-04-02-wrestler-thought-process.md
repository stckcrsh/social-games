# Wrestler Thought Process — Implementation Plan

**Goal:** Add a wrestler thought process as the first stage of the generate-show pipeline. Before the show is booked, each wrestler reflects on the week based on their manager's submission and their active story threads. The output is stored in the show JSON and used as context by the outline and promo agents. It does NOT mutate `threads.json` or `events.json` — that happens in the post-show mutations step (a separate future feature).

**Architecture:**

```
submissions close
    ↓
wrestler thought process  ← THIS PLAN
    ↓
generate show (outline → beats → promos → announcer) using thought process output as context
    ↓
show saved to disk (includes wrestlerThoughtProcess field)
    ↓
post-show mutations (future — updates threads.json and events.json)
    ↓
advance week
```

**Key design decisions:**
- Runs for ALL wrestlers every week, even those without a submission (use emotional state + existing threads as context)
- AI writes per-wrestler output: `thoughtSummary` (prose) + `threadUpdates` (care 1–10, stance, summary per active thread)
- AI sets care values for threads it mentions; the thread's `actorState` for this wrestler is NOT updated yet (post-show mutation does that)
- Runs in parallel per wrestler using `Promise.allSettled` (same pattern as beats/promos)
- Has a stub agent for `--stub` mode

---

## File Map

| Action | File | Responsibility |
|--------|------|----------------|
| Modify | `src/agents/types.ts` | Add `WrestlerThoughtProcessInput`, `WrestlerThoughtProcessOutput`, `WrestlerThreadUpdate`, `WrestlerThoughtProcessAgentFn`; update `GeneratedShow` and `ShowOutlineInput` |
| Modify | `src/agents/dataBuilders.ts` | Add `buildWrestlerThoughtProcessInput()` |
| Modify | `src/agents/dataBuilders.spec.ts` | Tests for new builder |
| Create | `src/agents/stubs/stubWrestlerThoughtProcessAgent.ts` | Stub agent |
| Create | `prompts/wrestler-thought-process.md` | Prompt template |
| Create | `src/agents/openaiWrestlerThoughtProcessAgent.ts` | Real OpenAI agent |
| Create | `src/agents/wrestlerThoughtProcessAgent.spec.ts` | TDD tests for real agent |
| Modify | `src/agents/pipeline.ts` | Add Step 0 (thought process); add `threads` and agent to params; include output in `GeneratedShow` |
| Modify | `src/agents/pipeline.spec.ts` | Tests for new pipeline stage |
| Modify | `src/generate-show.ts` | Load threads; add agent to `baseAgents`; pass `threads` to pipeline |

---

## Task 1: New types in `agents/types.ts`

**File:** `src/agents/types.ts`

Add to the imports at the top:

```typescript
import type { SocialThread, StoryRequest } from '@org/wrastlin-shared';
```

Add these new interfaces after the existing agent function interfaces at the bottom:

```typescript
// ── Wrestler Thought Process (Stage 0) ────────────────────────────────────────

export interface WrestlerThoughtProcessInput {
  wrestler: {
    wrestlerId: string;
    name: string;
    gimmick: string;
    personality: WrestlerPersonality;
    emotionalState: WrestlerEmotions;
  };
  submission: {
    wrestlerMessage: string | undefined;
    storyRequests: StoryRequest[];
  } | null;  // null if no submission this week
  activeThreads: SocialThread[];  // threads where this wrestler is a subject or actor
}

export interface WrestlerThreadUpdate {
  threadId: string;
  care: number;    // 1–10, AI-set: how much this thread is on the wrestler's mind
  stance: string;  // free-form e.g. 'vengeful', 'motivated', 'dismissive'
  summary: string; // prose: wrestler's current interpretation of this thread
}

export interface WrestlerThoughtProcessOutput {
  wrestlerId: string;
  thoughtSummary: string;  // 2-3 sentences: what is on this wrestler's mind overall
  threadUpdates: WrestlerThreadUpdate[];
}

export type WrestlerThoughtProcessAgentFn = (
  input: WrestlerThoughtProcessInput
) => Promise<WrestlerThoughtProcessOutput>;
```

Update `GeneratedShow` to include thought process output:

```typescript
export interface GeneratedShow {
  showOutline: ShowOutline;
  segments: GeneratedSegment[];
  wrestlerThoughtProcess: WrestlerThoughtProcessOutput[];
}
```

Update `ShowOutlineInput` so the outline agent receives thought process context:

```typescript
export interface ShowOutlineInput {
  week: number;
  previousOutlines: ShowOutline[];
  wrestlers: WrestlerSummaryForOutline[];
  submissions: SubmissionSummaryForOutline[];
  wrestlerThoughtProcess: WrestlerThoughtProcessOutput[];
}
```

- [ ] Make all changes above
- [ ] Run `pnpm nx test wrastlin-service` — expect compile-time failures where `buildShowOutlineInput` constructs `ShowOutlineInput` without `wrestlerThoughtProcess`; fix by adding `wrestlerThoughtProcess: []` as a placeholder in `buildShowOutlineInput` (will be replaced in Task 3)
- [ ] Confirm tests pass after fixing compile errors
- [ ] Commit: `feat(wrastlin): add WrestlerThoughtProcess types to pipeline`

---

## Task 2: Data builder — `buildWrestlerThoughtProcessInput`

**Files:**
- Modify: `src/agents/dataBuilders.ts`
- Modify: `src/agents/dataBuilders.spec.ts`

### Step 1: Write failing tests

In `src/agents/dataBuilders.spec.ts`, add after the existing imports:

```typescript
import type { SocialThread } from '@org/wrastlin-shared';
import type { WrestlerThoughtProcessInput } from './types.js';
```

Add a fixture and describe block at the bottom of the file:

```typescript
const THREAD_WITH_WRESTLER: SocialThread = {
  threadId: 't-001',
  title: 'Rex vs Steel Conflict',
  subjects: ['w-001', 'w-002'],
  tags: ['conflict'],
  createdWeek: 1,
  lastUpdatedWeek: 1,
  eventIds: [],
  actorStates: [
    { wrestlerId: 'w-001', care: 8, stance: 'aggrieved', summary: 'Rex sees this as unfinished business' },
    { wrestlerId: 'w-002', care: 3, stance: 'dismissive', summary: 'Steel barely remembers it' },
  ],
};

const THREAD_UNRELATED: SocialThread = {
  threadId: 't-002',
  title: 'Unrelated Thread',
  subjects: ['w-003', 'w-004'],
  tags: ['conflict'],
  createdWeek: 1,
  lastUpdatedWeek: 1,
  eventIds: [],
  actorStates: [],
};

const SUBMISSION_W001: WeeklySubmission = {
  submissionId: 's-001',
  managerId: 'm-001',
  week: 2,
  advice: { matchStyle: 'brawl' },
  storyRequests: [{ type: 'feud', target: 'w-002', bribeAmount: 200 }],
  wrestlerMessage: 'I want revenge on Steel.',
  submittedAt: '2026-04-01T10:00:00Z',
};

describe('buildWrestlerThoughtProcessInput', () => {
  it('includes only threads where the wrestler is a subject', () => {
    const wrestler = makeWrestler('w-001');
    const result = buildWrestlerThoughtProcessInput(wrestler, SUBMISSION_W001, [THREAD_WITH_WRESTLER, THREAD_UNRELATED]);
    expect(result.activeThreads).toHaveLength(1);
    expect(result.activeThreads[0].threadId).toBe('t-001');
  });

  it('includes threads where the wrestler appears in actorStates but not subjects', () => {
    const threadActorOnly: SocialThread = {
      ...THREAD_UNRELATED,
      threadId: 't-003',
      subjects: ['w-003'],
      actorStates: [{ wrestlerId: 'w-001', care: 4, stance: 'curious', summary: 'Rex is watching' }],
    };
    const wrestler = makeWrestler('w-001');
    const result = buildWrestlerThoughtProcessInput(wrestler, undefined, [threadActorOnly]);
    expect(result.activeThreads).toHaveLength(1);
    expect(result.activeThreads[0].threadId).toBe('t-003');
  });

  it('maps submission wrestlerMessage and storyRequests', () => {
    const wrestler = makeWrestler('w-001');
    const result = buildWrestlerThoughtProcessInput(wrestler, SUBMISSION_W001, []);
    expect(result.submission?.wrestlerMessage).toBe('I want revenge on Steel.');
    expect(result.submission?.storyRequests).toHaveLength(1);
    expect(result.submission?.storyRequests[0].type).toBe('feud');
  });

  it('sets submission to null when no submission provided', () => {
    const wrestler = makeWrestler('w-001');
    const result = buildWrestlerThoughtProcessInput(wrestler, undefined, []);
    expect(result.submission).toBeNull();
  });

  it('maps wrestler identity fields', () => {
    const wrestler = makeWrestler('w-001');
    const result = buildWrestlerThoughtProcessInput(wrestler, undefined, []);
    expect(result.wrestler.wrestlerId).toBe('w-001');
    expect(result.wrestler.personality).toEqual(wrestler.personality);
    expect(result.wrestler.emotionalState).toEqual(wrestler.emotionalState);
  });
});
```

Also add `buildWrestlerThoughtProcessInput` to the import from `'./dataBuilders.js'` at the top of the spec file.

### Step 2: Run tests — confirm they fail

```bash
pnpm nx test wrastlin-service -- --reporter=verbose 2>&1 | grep -E "buildWrestlerThoughtProcessInput"
```

Expected: 5 tests failing with `buildWrestlerThoughtProcessInput is not a function`.

### Step 3: Implement

Add to the imports in `src/agents/dataBuilders.ts`:

```typescript
import type { SocialThread } from '@org/wrastlin-shared';
import type { WrestlerThoughtProcessInput } from './types.js';
```

Append to the bottom of `src/agents/dataBuilders.ts`:

```typescript
export function buildWrestlerThoughtProcessInput(
  wrestler: Wrestler,
  submission: WeeklySubmission | undefined,
  allThreads: SocialThread[],
): WrestlerThoughtProcessInput {
  const activeThreads = allThreads.filter(t =>
    t.subjects.includes(wrestler.wrestlerId) ||
    t.actorStates.some(a => a.wrestlerId === wrestler.wrestlerId)
  );

  return {
    wrestler: {
      wrestlerId: wrestler.wrestlerId,
      name: wrestler.name,
      gimmick: wrestler.gimmick,
      personality: wrestler.personality,
      emotionalState: wrestler.emotionalState,
    },
    submission: submission
      ? {
          wrestlerMessage: submission.wrestlerMessage,
          storyRequests: submission.storyRequests,
        }
      : null,
    activeThreads,
  };
}
```

### Step 4: Run tests — confirm they pass

```bash
pnpm nx test wrastlin-service -- --reporter=verbose 2>&1 | grep -E "buildWrestlerThoughtProcessInput"
```

Expected: 5 tests passing.

### Step 5: Commit

```bash
git add src/agents/dataBuilders.ts src/agents/dataBuilders.spec.ts
git commit -m "feat(wrastlin): add buildWrestlerThoughtProcessInput data builder"
```

---

## Task 3: Stub agent

**File:** `src/agents/stubs/stubWrestlerThoughtProcessAgent.ts`

No test needed for the stub — it's a trivial implementation exercised by pipeline tests.

Create the file:

```typescript
import type { WrestlerThoughtProcessAgentFn } from '../types.js';

export const stubWrestlerThoughtProcessAgent: WrestlerThoughtProcessAgentFn = async (input) => {
  return {
    wrestlerId: input.wrestler.wrestlerId,
    thoughtSummary: `${input.wrestler.name} is focused and ready for this week's show.`,
    threadUpdates: input.activeThreads.map(t => ({
      threadId: t.threadId,
      care: 5,
      stance: 'focused',
      summary: `${input.wrestler.name} is keeping this situation in mind.`,
    })),
  };
};
```

- [ ] Create the file
- [ ] Commit: `feat(wrastlin): add stubWrestlerThoughtProcessAgent`

---

## Task 4: Prompt template

**File:** `prompts/wrestler-thought-process.md`

Create the prompt template. The `loadPrompt` utility replaces `{{VARIABLE}}` placeholders.

```markdown
You are stepping into the mind of a professional wrestler the week of a big show.

## Wrestler

**Name:** {{WRESTLER_NAME}}  
**Gimmick:** {{WRESTLER_GIMMICK}}

**Current Emotional State:**
```json
{{EMOTIONAL_STATE_JSON}}
```

**Personality:**
```json
{{PERSONALITY_JSON}}
```

## Message from Manager This Week

{{SUBMISSION_MESSAGE}}

## Manager's Story Requests This Week

```json
{{STORY_REQUESTS_JSON}}
```

## Active Story Threads

These are the ongoing storylines and relationships this wrestler is currently part of:

```json
{{ACTIVE_THREADS_JSON}}
```

## Your Task

Based on everything above, describe what is on this wrestler's mind going into this week's show. Consider their manager's words, the story requests, and the threads they are involved in.

Only include threads from the list above that this wrestler is genuinely thinking about — a wrestler can only hold so many things in mind at once. It is fine to include none if nothing from the active threads feels relevant to the submission.

The `care` value (1–10) reflects how much mental space this thread is taking up right now. A care of 10 means it is consuming them; a care of 1 means it is barely a background thought.

Respond with a JSON object in this exact format — no markdown fences, just the raw JSON:

{
  "wrestlerId": "the wrestler's ID from above",
  "thoughtSummary": "2-3 sentences describing what is most on this wrestler's mind overall",
  "threadUpdates": [
    {
      "threadId": "thread ID from the active threads list",
      "care": 8,
      "stance": "one word or short phrase e.g. 'vengeful', 'dismissive', 'motivated', 'grateful'",
      "summary": "one sentence: how this wrestler currently sees this thread"
    }
  ]
}
```

- [ ] Create the file
- [ ] Commit: `feat(wrastlin): add wrestler-thought-process prompt template`

---

## Task 5: Real OpenAI agent

**Files:**
- Create: `src/agents/openaiWrestlerThoughtProcessAgent.ts`
- Create: `src/agents/wrestlerThoughtProcessAgent.spec.ts`

### Step 1: Write failing tests

Create `src/agents/wrestlerThoughtProcessAgent.spec.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { SocialThread } from '@org/wrastlin-shared';
import type { WrestlerThoughtProcessInput, WrestlerThoughtProcessOutput } from './types.js';
import { createOpenAIWrestlerThoughtProcessAgent } from './openaiWrestlerThoughtProcessAgent.js';

const mockCreate = vi.fn();

vi.mock('openai', () => ({
  default: vi.fn(() => ({
    chat: { completions: { create: mockCreate } },
  })),
}));

const INPUT: WrestlerThoughtProcessInput = {
  wrestler: {
    wrestlerId: 'w-001',
    name: 'Rex Dominion',
    gimmick: 'The Arrogant Champion',
    personality: { ego: 9, anger: 7, honor: 3, loyalty: 4, ambition: 10 },
    emotionalState: { confidence: 8, frustration: 6, fatigue: 3 },
  },
  submission: {
    wrestlerMessage: 'I want Steel gone for good.',
    storyRequests: [{ type: 'feud', target: 'w-002', bribeAmount: 300 }],
  },
  activeThreads: [
    {
      threadId: 't-001',
      title: 'Rex vs Steel Conflict',
      subjects: ['w-001', 'w-002'],
      tags: ['conflict'],
      createdWeek: 1,
      lastUpdatedWeek: 2,
      eventIds: ['e-001'],
      actorStates: [
        { wrestlerId: 'w-001', care: 7, stance: 'aggrieved', summary: 'Rex wants revenge' },
      ],
    },
  ],
};

const VALID_OUTPUT: WrestlerThoughtProcessOutput = {
  wrestlerId: 'w-001',
  thoughtSummary: 'Rex is consumed by his rivalry with Steel and wants to end it definitively.',
  threadUpdates: [
    { threadId: 't-001', care: 9, stance: 'vengeful', summary: 'Rex sees this as the most important thing in his career right now.' },
  ],
};

beforeEach(() => {
  mockCreate.mockReset();
});

describe('createOpenAIWrestlerThoughtProcessAgent', () => {
  it('returns parsed thought process output from model response', async () => {
    mockCreate.mockResolvedValue({
      choices: [{ message: { content: JSON.stringify(VALID_OUTPUT) } }],
    });

    const agent = createOpenAIWrestlerThoughtProcessAgent('test-key');
    const result = await agent(INPUT);

    expect(result.wrestlerId).toBe('w-001');
    expect(result.thoughtSummary).toBe(VALID_OUTPUT.thoughtSummary);
    expect(result.threadUpdates).toHaveLength(1);
    expect(result.threadUpdates[0].care).toBe(9);
    expect(result.threadUpdates[0].stance).toBe('vengeful');
  });

  it('includes wrestler name in the prompt', async () => {
    mockCreate.mockResolvedValue({
      choices: [{ message: { content: JSON.stringify(VALID_OUTPUT) } }],
    });

    const agent = createOpenAIWrestlerThoughtProcessAgent('test-key');
    await agent(INPUT);

    const prompt: string = mockCreate.mock.calls[0][0].messages[0].content;
    expect(prompt).toContain('Rex Dominion');
  });

  it('includes active thread title in the prompt', async () => {
    mockCreate.mockResolvedValue({
      choices: [{ message: { content: JSON.stringify(VALID_OUTPUT) } }],
    });

    const agent = createOpenAIWrestlerThoughtProcessAgent('test-key');
    await agent(INPUT);

    const prompt: string = mockCreate.mock.calls[0][0].messages[0].content;
    expect(prompt).toContain('Rex vs Steel Conflict');
  });

  it('includes wrestler message in the prompt', async () => {
    mockCreate.mockResolvedValue({
      choices: [{ message: { content: JSON.stringify(VALID_OUTPUT) } }],
    });

    const agent = createOpenAIWrestlerThoughtProcessAgent('test-key');
    await agent(INPUT);

    const prompt: string = mockCreate.mock.calls[0][0].messages[0].content;
    expect(prompt).toContain('I want Steel gone for good.');
  });

  it('uses fallback message when no submission', async () => {
    mockCreate.mockResolvedValue({
      choices: [{ message: { content: JSON.stringify({ ...VALID_OUTPUT, threadUpdates: [] }) } }],
    });

    const agent = createOpenAIWrestlerThoughtProcessAgent('test-key');
    await agent({ ...INPUT, submission: null });

    const prompt: string = mockCreate.mock.calls[0][0].messages[0].content;
    expect(prompt).toContain('No message submitted this week');
  });

  it('throws when response has no content', async () => {
    mockCreate.mockResolvedValue({ choices: [{ message: { content: null } }] });

    const agent = createOpenAIWrestlerThoughtProcessAgent('test-key');
    await expect(agent(INPUT)).rejects.toThrow();
  });
});
```

### Step 2: Run tests — confirm they fail

```bash
pnpm nx test wrastlin-service -- --reporter=verbose 2>&1 | grep -E "wrestlerThoughtProcess"
```

Expected: 5 tests failing with module not found.

### Step 3: Implement

Create `src/agents/openaiWrestlerThoughtProcessAgent.ts`:

```typescript
import OpenAI from 'openai';
import { loadPrompt } from './promptLoader.js';
import type {
  WrestlerThoughtProcessAgentFn,
  WrestlerThoughtProcessInput,
  WrestlerThoughtProcessOutput,
} from './types.js';

function buildVariables(input: WrestlerThoughtProcessInput): Record<string, string> {
  return {
    WRESTLER_NAME: input.wrestler.name,
    WRESTLER_GIMMICK: input.wrestler.gimmick,
    EMOTIONAL_STATE_JSON: JSON.stringify(input.wrestler.emotionalState, null, 2),
    PERSONALITY_JSON: JSON.stringify(input.wrestler.personality, null, 2),
    SUBMISSION_MESSAGE: input.submission?.wrestlerMessage ?? 'No message submitted this week.',
    STORY_REQUESTS_JSON: JSON.stringify(input.submission?.storyRequests ?? [], null, 2),
    ACTIVE_THREADS_JSON: JSON.stringify(input.activeThreads, null, 2),
  };
}

function isThoughtProcessOutput(val: unknown): val is WrestlerThoughtProcessOutput {
  if (!val || typeof val !== 'object') return false;
  const obj = val as Record<string, unknown>;
  return (
    typeof obj.wrestlerId === 'string' &&
    typeof obj.thoughtSummary === 'string' &&
    Array.isArray(obj.threadUpdates)
  );
}

function extractJson(text: string): string {
  return text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
}

export function createOpenAIWrestlerThoughtProcessAgent(
  apiKey: string,
): WrestlerThoughtProcessAgentFn {
  const client = new OpenAI({ apiKey });

  return async (input: WrestlerThoughtProcessInput): Promise<WrestlerThoughtProcessOutput> => {
    const prompt = loadPrompt('wrestler-thought-process.md', buildVariables(input));

    const response = await client.chat.completions.create({
      model: 'gpt-4o',
      max_tokens: 1024,
      messages: [{ role: 'user', content: prompt }],
    });

    const text = response.choices[0]?.message?.content ?? '';
    if (!text) throw new Error('No content in wrestler thought process response');

    const parsed: unknown = JSON.parse(extractJson(text));

    if (!isThoughtProcessOutput(parsed)) {
      throw new Error(`Response does not match WrestlerThoughtProcessOutput schema: ${text.slice(0, 200)}`);
    }

    return parsed;
  };
}
```

### Step 4: Run tests — confirm they pass

```bash
pnpm nx test wrastlin-service -- --reporter=verbose 2>&1 | grep -E "wrestlerThoughtProcess"
```

Expected: 5 tests passing.

### Step 5: Commit

```bash
git add src/agents/openaiWrestlerThoughtProcessAgent.ts \
        src/agents/wrestlerThoughtProcessAgent.spec.ts \
        prompts/wrestler-thought-process.md
git commit -m "feat(wrastlin): add openaiWrestlerThoughtProcessAgent"
```

---

## Task 6: Pipeline integration

**Files:**
- Modify: `src/agents/pipeline.ts`
- Modify: `src/agents/pipeline.spec.ts`

### Step 1: Write failing tests

In `src/agents/pipeline.spec.ts`, add to imports:

```typescript
import type { SocialThread } from '@org/wrastlin-shared';
import type { WrestlerThoughtProcessOutput } from './types.js';
import { stubWrestlerThoughtProcessAgent } from './stubs/stubWrestlerThoughtProcessAgent.js';
```

Update `STUB_AGENTS` to include the new agent:

```typescript
const STUB_AGENTS = {
  wrestlerThoughtProcess: stubWrestlerThoughtProcessAgent,
  showOutline: stubShowOutlineAgent,
  matchBeats: stubMatchBeatsAgent,
  promoScreenplay: stubPromoScreenplayAgent,
  announcerScreenplay: stubAnnouncerScreenplayAgent,
};
```

Add `threads: []` to all existing `runShowPipeline` calls in the spec (they pass `PipelineParams` and need the new field).

Add new tests:

```typescript
describe('wrestler thought process stage', () => {
  it('calls thought process agent once per wrestler', async () => {
    const thoughtSpy = vi.fn(stubWrestlerThoughtProcessAgent);
    await runShowPipeline({
      showOutlineInput: buildShowOutlineInput(1, WRESTLERS, MANAGERS, [], []),
      wrestlers: WRESTLERS,
      managers: MANAGERS,
      submissions: [],
      announcers: ANNOUNCERS,
      threads: [],
      agents: { ...STUB_AGENTS, wrestlerThoughtProcess: thoughtSpy },
    });
    expect(thoughtSpy).toHaveBeenCalledTimes(WRESTLERS.length);
  });

  it('includes wrestlerThoughtProcess in the returned show', async () => {
    const result = await runShowPipeline({
      showOutlineInput: buildShowOutlineInput(1, WRESTLERS, MANAGERS, [], []),
      wrestlers: WRESTLERS,
      managers: MANAGERS,
      submissions: [],
      announcers: ANNOUNCERS,
      threads: [],
      agents: STUB_AGENTS,
    });
    expect(result.wrestlerThoughtProcess).toHaveLength(WRESTLERS.length);
    expect(result.wrestlerThoughtProcess[0].wrestlerId).toBeDefined();
  });

  it('throws PartialRunError if any thought process agent call fails', async () => {
    const failingAgent = vi.fn().mockRejectedValue(new Error('OpenAI down'));
    await expect(
      runShowPipeline({
        showOutlineInput: buildShowOutlineInput(1, WRESTLERS, MANAGERS, [], []),
        wrestlers: WRESTLERS,
        managers: MANAGERS,
        submissions: [],
        announcers: ANNOUNCERS,
        threads: [],
        agents: { ...STUB_AGENTS, wrestlerThoughtProcess: failingAgent },
      })
    ).rejects.toThrow(PartialRunError);
  });
});
```

### Step 2: Run tests — confirm they fail

```bash
pnpm nx test wrastlin-service -- --reporter=verbose 2>&1 | grep -E "thought process stage"
```

Expected: 3 tests failing; existing tests may also fail due to missing `threads` field.

### Step 3: Update `pipeline.ts`

Add to imports:

```typescript
import type { SocialThread } from '@org/wrastlin-shared';
import type { WrestlerThoughtProcessAgentFn, WrestlerThoughtProcessOutput } from './types.js';
import { buildWrestlerThoughtProcessInput } from './dataBuilders.js';
```

Update `PipelineParams`:

```typescript
interface PipelineParams {
  showOutlineInput: ShowOutlineInput;
  wrestlers: Wrestler[];
  managers: Manager[];
  submissions: WeeklySubmission[];
  announcers: Announcer[];
  threads: SocialThread[];
  agents: {
    wrestlerThoughtProcess: WrestlerThoughtProcessAgentFn;
    showOutline: ShowOutlineAgentFn;
    matchBeats: MatchBeatsAgentFn;
    promoScreenplay: PromoScreenplayAgentFn;
    announcerScreenplay: AnnouncerScreenplayAgentFn;
  };
}
```

At the top of `runShowPipeline`, before the outline step, add Step 0:

```typescript
const { showOutlineInput, wrestlers, managers, submissions, announcers, threads, agents } = params;

// Step 0: Wrestler thought process (parallel per wrestler — runs before outline)
const step0Settled = await Promise.allSettled(
  wrestlers.map(async (wrestler): Promise<WrestlerThoughtProcessOutput> => {
    const submission = submissions.find(s => {
      const manager = managers.find(m => m.managerId === s.managerId);
      return manager?.wrestlerId === wrestler.wrestlerId;
    });
    const input = buildWrestlerThoughtProcessInput(wrestler, submission, threads);
    return agents.wrestlerThoughtProcess(input);
  })
);

const step0Failed: string[] = [];
const wrestlerThoughtProcess: WrestlerThoughtProcessOutput[] = [];
for (let i = 0; i < step0Settled.length; i++) {
  const result = step0Settled[i];
  if (result.status === 'fulfilled') {
    wrestlerThoughtProcess.push(result.value);
  } else {
    step0Failed.push(wrestlers[i].wrestlerId);
  }
}
if (step0Failed.length > 0) throw new PartialRunError(step0Failed);
```

Pass thought process output into the outline input:

```typescript
// Step 1: Generate show outline (uses thought process as context)
const showOutline = await agents.showOutline({
  ...showOutlineInput,
  wrestlerThoughtProcess,
});
```

Update the return value:

```typescript
return { showOutline, segments: generatedSegments, wrestlerThoughtProcess };
```

### Step 4: Run tests — confirm they pass

```bash
pnpm nx test wrastlin-service -- --reporter=verbose 2>&1 | tail -5
```

Expected: all tests pass.

### Step 5: Commit

```bash
git add src/agents/pipeline.ts src/agents/pipeline.spec.ts
git commit -m "feat(wrastlin): add wrestler thought process as Step 0 in show pipeline"
```

---

## Task 7: Wire into `generate-show.ts`

**File:** `src/generate-show.ts`

### Step 1: Load threads and add agent

Add to imports:

```typescript
import { loadWrestlers, loadManagers, loadState, saveState, loadSubmissions, loadAnnouncers, loadThreads } from './core/gameState.js';
import { stubWrestlerThoughtProcessAgent } from './agents/stubs/stubWrestlerThoughtProcessAgent.js';
import { createOpenAIWrestlerThoughtProcessAgent } from './agents/openaiWrestlerThoughtProcessAgent.js';
```

After loading wrestlers/managers/submissions/announcers, add:

```typescript
const threads = loadThreads();
```

Add to `baseAgents`:

```typescript
const baseAgents = {
  wrestlerThoughtProcess: useStub
    ? stubWrestlerThoughtProcessAgent
    : createOpenAIWrestlerThoughtProcessAgent(process.env.OPENAI_API_KEY!),
  showOutline: useStub ? ... // existing
  // ... rest unchanged
};
```

Add to the agents wrapper object:

```typescript
const agents = {
  wrestlerThoughtProcess: (input: WrestlerThoughtProcessInput) =>
    runner.wrap('wrestlerThoughtProcess', input.wrestler.wrestlerId, baseAgents.wrestlerThoughtProcess)(input),
  // ... existing agents unchanged
};
```

Pass `threads` to `runShowPipeline`:

```typescript
const show = await runShowPipeline({
  showOutlineInput,
  wrestlers,
  managers,
  submissions,
  announcers,
  threads,
  agents,
});
```

### Step 2: Update show outline input builder call

`buildShowOutlineInput` currently passes `wrestlerThoughtProcess: []` as a placeholder (from Task 1). Now that the pipeline provides the real value, the `showOutlineInput` built before calling `runShowPipeline` no longer needs it — the pipeline merges it in when calling the outline agent. No change needed here.

### Step 3: Update console output

After the existing `SEGMENTS:` output, add:

```typescript
console.log('\nWRESTLER THOUGHT PROCESS:');
show.wrestlerThoughtProcess.forEach(t => {
  const name = nameMap.get(t.wrestlerId) ?? t.wrestlerId;
  console.log(`  ${name}: ${t.thoughtSummary}`);
});
```

### Step 4: Run the pipeline end-to-end in stub mode

```bash
pnpm nx run wrastlin-service:generate-show -- --stub --force
```

Expected: shows thought process summaries in output for each wrestler.

### Step 5: Commit

```bash
git add src/generate-show.ts
git commit -m "feat(wrastlin): wire wrestlerThoughtProcess into generate-show"
```

---

## Self-Review

**Type coverage:**
- [ ] `WrestlerThoughtProcessInput` — Task 1
- [ ] `WrestlerThoughtProcessOutput` — Task 1
- [ ] `WrestlerThreadUpdate` — Task 1
- [ ] `WrestlerThoughtProcessAgentFn` — Task 1
- [ ] `GeneratedShow.wrestlerThoughtProcess` — Task 1
- [ ] `ShowOutlineInput.wrestlerThoughtProcess` — Task 1

**Data builder:**
- [ ] `buildWrestlerThoughtProcessInput` — Task 2
- [ ] Filters threads to only those involving the wrestler — Task 2
- [ ] Null submission when no manager submitted — Task 2

**Agents:**
- [ ] Stub agent returns minimal valid output — Task 3
- [ ] Prompt template has all variables — Task 4
- [ ] Real agent calls gpt-4o, parses JSON response — Task 5
- [ ] Real agent tests: output shape, prompt contents, null submission fallback, empty content throws — Task 5

**Pipeline:**
- [ ] Step 0 runs before outline — Task 6
- [ ] All wrestlers run in parallel — Task 6
- [ ] `PartialRunError` thrown on any failure — Task 6
- [ ] Output included in `GeneratedShow` — Task 6
- [ ] Thought process passed to outline agent — Task 6

**generate-show.ts:**
- [ ] Threads loaded from `loadThreads()` — Task 7
- [ ] Agent wired for both stub and AI modes — Task 7
- [ ] Console output shows thought summaries — Task 7
- [ ] End-to-end `--stub --force` run completes — Task 7

**Does NOT do (intentionally out of scope):**
- Does not update `threads.json` (post-show mutations, separate plan)
- Does not update `events.json` (post-show mutations, separate plan)
- Does not apply care decay (post-show mutations)
- Does not integrate thought process into show outline prompt text (prompt integration sub-project)
