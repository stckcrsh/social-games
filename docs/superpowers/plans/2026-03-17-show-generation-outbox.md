# Show Generation Outbox Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire `runShowPipeline` into `generate-show.ts` with JSONL outbox, checkpoint-based resume (`--resume`), and stub agent mode (`--stub`).

**Architecture:** `RunLog` manages JSONL I/O and a completion map. `OutboxRunner` wraps agent calls — cache hit returns immediately, cache miss writes `agent_started`/`agent_completed`/`agent_failed` events. `pipeline.ts` switches to `Promise.allSettled` so in-flight segments finish before a `PartialRunError` propagates. `generate-show.ts` is fully rewritten to wire all pieces together.

**Tech Stack:** Node.js ESM, TypeScript `nodenext`, `node:fs` synchronous I/O, vitest 3.

**Spec:** `docs/superpowers/specs/2026-03-17-show-generation-outbox-design.md`

---

## Chunk 1: loadAnnouncers + RunLog

### Task 1: Add `loadAnnouncers` to `gameState.ts`

**Files:**
- Modify: `apps/wrastlin/meta-service/src/core/gameState.ts`
- Create: `apps/wrastlin/meta-service/src/core/gameState.spec.ts`

Key context: `readStaticJson` is imported from `'../data/persistence.js'`. Use it directly — no dynamic fallback. The `Announcer` type comes from `'@org/wrastlin-shared'` (already imported in `pipeline.ts`). The static file `data/static/announcers.json` already exists.

Tests use `vi.resetModules()` + `process.env.STATIC_DATA_DIR` to override the path — same pattern as `persistence.spec.ts`. Must use dynamic `import()` after setting env vars because `STATIC_DIR` is evaluated at module load time.

- [ ] **Step 1: Write the failing test**

Create `apps/wrastlin/meta-service/src/core/gameState.spec.ts`:

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { Announcer } from '@org/wrastlin-shared';

describe('loadAnnouncers', () => {
  let tmpDir: string;

  beforeEach(() => {
    vi.resetModules();
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wrastlin-gamestate-test-'));
    process.env.STATIC_DATA_DIR = tmpDir;
  });

  afterEach(() => {
    delete process.env.STATIC_DATA_DIR;
    fs.rmSync(tmpDir, { recursive: true });
  });

  it('loads announcers from static data', async () => {
    const announcers: Announcer[] = [{
      announcerId: 'a-001',
      name: 'Test Announcer',
      role: 'play-by-play',
      theme: 'Energetic',
      catchphrases: ['Wow!'],
    }];
    fs.writeFileSync(path.join(tmpDir, 'announcers.json'), JSON.stringify(announcers));
    const { loadAnnouncers } = await import('./gameState.js');
    expect(loadAnnouncers()).toEqual(announcers);
  });

  it('throws if announcers.json is missing', async () => {
    const { loadAnnouncers } = await import('./gameState.js');
    expect(() => loadAnnouncers()).toThrow();
  });
});
```

- [ ] **Step 2: Run test to confirm it fails**

```bash
cd apps/wrastlin/meta-service && pnpm vitest run --reporter=verbose src/core/gameState.spec.ts
```

Expected: FAIL — `loadAnnouncers is not a function`

- [ ] **Step 3: Add `loadAnnouncers` to `gameState.ts`**

Add to the import line at the top of `apps/wrastlin/meta-service/src/core/gameState.ts`:
```ts
import type { Wrestler, Manager, WeeklyState, WeeklySubmission, Announcer } from '@org/wrastlin-shared';
```

Add this function after `loadSubmissions`:
```ts
export function loadAnnouncers(): Announcer[] {
  return readStaticJson<Announcer[]>('announcers.json');
}
```

- [ ] **Step 4: Run test to confirm it passes**

```bash
cd apps/wrastlin/meta-service && pnpm vitest run --reporter=verbose src/core/gameState.spec.ts
```

Expected: 2 tests PASS

- [ ] **Step 5: Commit**

```bash
git add apps/wrastlin/meta-service/src/core/gameState.ts apps/wrastlin/meta-service/src/core/gameState.spec.ts
git commit -m "feat(wrastlin): add loadAnnouncers to gameState"
```

---

### Task 2: Create `RunLog`

**Files:**
- Create: `apps/wrastlin/meta-service/src/agents/runLog.ts`
- Create: `apps/wrastlin/meta-service/src/agents/runLog.spec.ts`

`RunLog` uses synchronous `fs.appendFileSync` and `fs.readFileSync` — no async I/O needed. The constructor reads and builds the completion map if the file exists. `append` creates parent directories if missing via `fs.mkdirSync(..., { recursive: true })`.

Cache key format: `${agentType}:${segmentId ?? 'root'}` — `showOutline` uses `null` → key is `showOutline:root`.

- [ ] **Step 1: Write the failing tests**

Create `apps/wrastlin/meta-service/src/agents/runLog.spec.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { RunLog } from './runLog.js';
import type { LogEntry } from './runLog.js';

describe('RunLog', () => {
  let tmpDir: string;
  let filePath: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'runlog-test-'));
    filePath = path.join(tmpDir, 'week-1-20260317T120000.jsonl');
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true });
  });

  it('derives runId from filename without extension', () => {
    const log = new RunLog(filePath);
    expect(log.runId).toBe('week-1-20260317T120000');
  });

  it('appends entries as JSON lines', () => {
    const log = new RunLog(filePath);
    const entry: LogEntry = {
      type: 'run_started', runId: log.runId, week: 1, mode: 'stub',
      timestamp: '2026-03-17T12:00:00Z',
    };
    log.append(entry);
    const lines = fs.readFileSync(filePath, 'utf-8').trim().split('\n');
    expect(lines).toHaveLength(1);
    expect(JSON.parse(lines[0])).toEqual(entry);
  });

  it('getCompleted returns undefined for unknown key', () => {
    const log = new RunLog(filePath);
    expect(log.getCompleted('matchBeats', 'seg-1')).toBeUndefined();
  });

  it('builds completion map from existing file on construction', () => {
    const entry: LogEntry = {
      type: 'agent_completed', runId: 'week-1-20260317T120000',
      agentType: 'matchBeats', segmentId: 'seg-1',
      output: { beats: [] }, timestamp: '2026-03-17T12:00:01Z',
    };
    fs.writeFileSync(filePath, JSON.stringify(entry) + '\n');
    const log = new RunLog(filePath);
    expect(log.getCompleted('matchBeats', 'seg-1')).toEqual({ beats: [] });
  });

  it('ignores agent_failed entries when building completion map', () => {
    const entry: LogEntry = {
      type: 'agent_failed', runId: 'week-1-20260317T120000',
      agentType: 'matchBeats', segmentId: 'seg-1',
      error: 'timeout', timestamp: '2026-03-17T12:00:01Z',
    };
    fs.writeFileSync(filePath, JSON.stringify(entry) + '\n');
    const log = new RunLog(filePath);
    expect(log.getCompleted('matchBeats', 'seg-1')).toBeUndefined();
  });

  it('uses "root" key for null segmentId (showOutline)', () => {
    const entry: LogEntry = {
      type: 'agent_completed', runId: 'week-1-20260317T120000',
      agentType: 'showOutline', segmentId: null,
      output: { showId: 'stub-show-001', week: 1, segments: [] },
      timestamp: '2026-03-17T12:00:01Z',
    };
    fs.writeFileSync(filePath, JSON.stringify(entry) + '\n');
    const log = new RunLog(filePath);
    expect(log.getCompleted('showOutline', null)).toEqual({
      showId: 'stub-show-001', week: 1, segments: [],
    });
  });

  it('creates parent directories on first append', () => {
    const nestedPath = path.join(tmpDir, 'nested', 'dir', 'run.jsonl');
    const log = new RunLog(nestedPath);
    log.append({ type: 'run_started', runId: 'run', week: 1, mode: 'stub', timestamp: 't' });
    expect(fs.existsSync(nestedPath)).toBe(true);
  });
});
```

- [ ] **Step 2: Run to confirm failure**

```bash
cd apps/wrastlin/meta-service && pnpm vitest run --reporter=verbose src/agents/runLog.spec.ts
```

Expected: FAIL — module not found

- [ ] **Step 3: Implement `runLog.ts`**

Create `apps/wrastlin/meta-service/src/agents/runLog.ts`:

```ts
import fs from 'node:fs';
import path from 'node:path';

export type AgentType = 'showOutline' | 'matchBeats' | 'promoScreenplay' | 'announcerScreenplay';

export type LogEntry =
  | { type: 'run_started';     runId: string; week: number; mode: 'stub' | 'ai'; timestamp: string }
  | { type: 'agent_started';   runId: string; agentType: AgentType; segmentId: string | null; input: unknown; timestamp: string }
  | { type: 'agent_completed'; runId: string; agentType: AgentType; segmentId: string | null; output: unknown; timestamp: string }
  | { type: 'agent_failed';    runId: string; agentType: AgentType; segmentId: string | null; error: string; timestamp: string }
  | { type: 'run_completed';   runId: string; showId: string; timestamp: string }
  | { type: 'run_failed';      runId: string; failedSegments: string[]; timestamp: string };

function cacheKey(agentType: AgentType, segmentId: string | null): string {
  return `${agentType}:${segmentId ?? 'root'}`;
}

export class RunLog {
  readonly runId: string;
  private readonly filePath: string;
  private readonly completionMap = new Map<string, unknown>();

  constructor(filePath: string) {
    this.filePath = filePath;
    this.runId = path.basename(filePath, '.jsonl');

    if (fs.existsSync(filePath)) {
      const lines = fs.readFileSync(filePath, 'utf-8').split('\n').filter(Boolean);
      for (const line of lines) {
        const entry = JSON.parse(line) as LogEntry;
        if (entry.type === 'agent_completed') {
          this.completionMap.set(cacheKey(entry.agentType, entry.segmentId), entry.output);
        }
      }
    }
  }

  append(entry: LogEntry): void {
    fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
    fs.appendFileSync(this.filePath, JSON.stringify(entry) + '\n', 'utf-8');
  }

  getCompleted(agentType: AgentType, segmentId: string | null): unknown | undefined {
    return this.completionMap.get(cacheKey(agentType, segmentId));
  }
}
```

- [ ] **Step 4: Run to confirm passing**

```bash
cd apps/wrastlin/meta-service && pnpm vitest run --reporter=verbose src/agents/runLog.spec.ts
```

Expected: 7 tests PASS

- [ ] **Step 5: Commit**

```bash
git add apps/wrastlin/meta-service/src/agents/runLog.ts apps/wrastlin/meta-service/src/agents/runLog.spec.ts
git commit -m "feat(wrastlin): add RunLog for JSONL outbox"
```

---

## Chunk 2: OutboxRunner + pipeline changes

### Task 3: Create `OutboxRunner`

**Files:**
- Create: `apps/wrastlin/meta-service/src/agents/outboxRunner.ts`
- Create: `apps/wrastlin/meta-service/src/agents/outboxRunner.spec.ts`

`OutboxRunner` does NOT contain retry logic. It only: checks cache → writes started → calls agent → writes completed or failed. The `wrap` method binds `segmentId` at call time, creating a fresh closure per invocation.

- [ ] **Step 1: Write the failing tests**

Create `apps/wrastlin/meta-service/src/agents/outboxRunner.spec.ts`:

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { RunLog } from './runLog.js';
import { OutboxRunner } from './outboxRunner.js';

describe('OutboxRunner', () => {
  let tmpDir: string;
  let filePath: string;
  let log: RunLog;
  let runner: OutboxRunner;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'outbox-test-'));
    filePath = path.join(tmpDir, 'week-1-20260317T120000.jsonl');
    log = new RunLog(filePath);
    runner = new OutboxRunner(log);
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true });
  });

  it('calls agent and writes agent_started + agent_completed on cache miss', async () => {
    const agent = vi.fn().mockResolvedValue({ result: 'output' });
    const result = await runner.wrap('matchBeats', 'seg-1', agent)({ some: 'input' });

    expect(result).toEqual({ result: 'output' });
    expect(agent).toHaveBeenCalledTimes(1);

    const lines = fs.readFileSync(filePath, 'utf-8').trim().split('\n').map(l => JSON.parse(l));
    expect(lines).toHaveLength(2);
    expect(lines[0].type).toBe('agent_started');
    expect(lines[0].agentType).toBe('matchBeats');
    expect(lines[0].segmentId).toBe('seg-1');
    expect(lines[1].type).toBe('agent_completed');
    expect(lines[1].output).toEqual({ result: 'output' });
  });

  it('returns cached output without calling agent on cache hit', async () => {
    // Pre-populate JSONL then load a fresh RunLog
    log.append({
      type: 'agent_completed', runId: log.runId,
      agentType: 'matchBeats', segmentId: 'seg-1',
      output: { cached: true }, timestamp: new Date().toISOString(),
    });
    const freshLog = new RunLog(filePath);
    const freshRunner = new OutboxRunner(freshLog);

    const agent = vi.fn().mockResolvedValue({ cached: false });
    const result = await freshRunner.wrap('matchBeats', 'seg-1', agent)({ some: 'input' });

    expect(result).toEqual({ cached: true });
    expect(agent).not.toHaveBeenCalled();
  });

  it('writes agent_failed and re-throws when agent throws', async () => {
    const agent = vi.fn().mockRejectedValue(new Error('API timeout'));
    await expect(runner.wrap('matchBeats', 'seg-1', agent)({ some: 'input' }))
      .rejects.toThrow('API timeout');

    const lines = fs.readFileSync(filePath, 'utf-8').trim().split('\n').map(l => JSON.parse(l));
    expect(lines).toHaveLength(2);
    expect(lines[0].type).toBe('agent_started');
    expect(lines[1].type).toBe('agent_failed');
    expect(lines[1].error).toBe('API timeout');
  });

  it('does not write any events when returning from cache', async () => {
    log.append({
      type: 'agent_completed', runId: log.runId,
      agentType: 'matchBeats', segmentId: 'seg-1',
      output: { x: 1 }, timestamp: new Date().toISOString(),
    });
    const freshLog = new RunLog(filePath);
    const linesBefore = fs.readFileSync(filePath, 'utf-8').trim().split('\n').length;

    const freshRunner = new OutboxRunner(freshLog);
    await freshRunner.wrap('matchBeats', 'seg-1', vi.fn())({ input: true });

    const linesAfter = fs.readFileSync(filePath, 'utf-8').trim().split('\n').length;
    expect(linesAfter).toBe(linesBefore); // no new writes
  });

  it('uses different cache keys for different segmentIds', async () => {
    log.append({
      type: 'agent_completed', runId: log.runId,
      agentType: 'matchBeats', segmentId: 'seg-1',
      output: { segment: 1 }, timestamp: new Date().toISOString(),
    });
    const freshLog = new RunLog(filePath);
    const freshRunner = new OutboxRunner(freshLog);

    const agent = vi.fn().mockResolvedValue({ segment: 2 });

    const seg1Result = await freshRunner.wrap('matchBeats', 'seg-1', agent)({ id: 1 });
    expect(seg1Result).toEqual({ segment: 1 });
    expect(agent).not.toHaveBeenCalled();

    const seg2Result = await freshRunner.wrap('matchBeats', 'seg-2', agent)({ id: 2 });
    expect(seg2Result).toEqual({ segment: 2 });
    expect(agent).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Run to confirm failure**

```bash
cd apps/wrastlin/meta-service && pnpm vitest run --reporter=verbose src/agents/outboxRunner.spec.ts
```

Expected: FAIL — module not found

- [ ] **Step 3: Implement `outboxRunner.ts`**

Create `apps/wrastlin/meta-service/src/agents/outboxRunner.ts`:

```ts
import type { RunLog, AgentType } from './runLog.js';

export class OutboxRunner {
  constructor(private readonly log: RunLog) {}

  wrap<TInput, TOutput>(
    agentType: AgentType,
    segmentId: string | null,
    agent: (input: TInput) => Promise<TOutput>,
  ): (input: TInput) => Promise<TOutput> {
    return async (input: TInput): Promise<TOutput> => {
      const cached = this.log.getCompleted(agentType, segmentId);
      if (cached !== undefined) {
        return cached as TOutput;
      }

      this.log.append({
        type: 'agent_started',
        runId: this.log.runId,
        agentType,
        segmentId,
        input,
        timestamp: new Date().toISOString(),
      });

      try {
        const output = await agent(input);
        this.log.append({
          type: 'agent_completed',
          runId: this.log.runId,
          agentType,
          segmentId,
          output,
          timestamp: new Date().toISOString(),
        });
        return output;
      } catch (err) {
        this.log.append({
          type: 'agent_failed',
          runId: this.log.runId,
          agentType,
          segmentId,
          error: err instanceof Error ? err.message : String(err),
          timestamp: new Date().toISOString(),
        });
        throw err;
      }
    };
  }
}
```

- [ ] **Step 4: Run to confirm passing**

```bash
cd apps/wrastlin/meta-service && pnpm vitest run --reporter=verbose src/agents/outboxRunner.spec.ts
```

Expected: 5 tests PASS

- [ ] **Step 5: Commit**

```bash
git add apps/wrastlin/meta-service/src/agents/outboxRunner.ts apps/wrastlin/meta-service/src/agents/outboxRunner.spec.ts
git commit -m "feat(wrastlin): add OutboxRunner for agent event logging"
```

---

### Task 4: Update `pipeline.ts` — `Promise.allSettled` + `PartialRunError`

**Files:**
- Modify: `apps/wrastlin/meta-service/src/agents/pipeline.ts`
- Modify: `apps/wrastlin/meta-service/src/agents/pipeline.spec.ts`

Both parallel steps (step 2 and step 3 in `runShowPipeline`) switch from `Promise.all` to `Promise.allSettled`. After settling, collect failed segment IDs and throw `PartialRunError` if any. Export `PartialRunError` so `generate-show.ts` can catch it.

- [ ] **Step 1: Add failing tests to `pipeline.spec.ts`**

Add these two tests inside the existing `describe('runShowPipeline', ...)` block in `apps/wrastlin/meta-service/src/agents/pipeline.spec.ts`:

```ts
import { PartialRunError } from './pipeline.js';

// Add inside the describe block:

it('throws PartialRunError (not immediate rejection) when a segment agent fails', async () => {
  let matchCallCount = 0;
  const failingMatchBeats = vi.fn(async (input: MatchBeatsInput): Promise<MatchBeats> => {
    matchCallCount++;
    if (matchCallCount === 1) throw new Error('agent failed');
    return stubMatchBeatsAgent(input);
  });

  await expect(runShowPipeline({
    showOutlineInput: buildShowOutlineInput(1, WRESTLERS, MANAGERS, [], []),
    wrestlers: WRESTLERS,
    managers: MANAGERS,
    submissions: [],
    announcers: ANNOUNCERS,
    agents: { ...STUB_AGENTS, matchBeats: failingMatchBeats },
  })).rejects.toThrow(PartialRunError);

  // Both match segments were still attempted (allSettled, not all)
  expect(failingMatchBeats).toHaveBeenCalledTimes(2);
});

it('PartialRunError includes the failed segment id', async () => {
  const failingMatchBeats = vi.fn(async (): Promise<MatchBeats> => {
    throw new Error('timeout');
  });

  const err = await runShowPipeline({
    showOutlineInput: buildShowOutlineInput(1, WRESTLERS, MANAGERS, [], []),
    wrestlers: WRESTLERS,
    managers: MANAGERS,
    submissions: [],
    announcers: ANNOUNCERS,
    agents: { ...STUB_AGENTS, matchBeats: failingMatchBeats },
  }).catch(e => e);

  expect(err).toBeInstanceOf(PartialRunError);
  expect((err as PartialRunError).failedSegmentIds.length).toBeGreaterThan(0);
});
```

Also add the `MatchBeatsInput` import to `pipeline.spec.ts`:
```ts
import type { GeneratedMatchSegment, GeneratedPromoSegment, MatchBeatsInput, MatchBeats } from './types.js';
```

- [ ] **Step 2: Run to confirm new tests fail**

```bash
cd apps/wrastlin/meta-service && pnpm vitest run --reporter=verbose src/agents/pipeline.spec.ts
```

Expected: 2 new tests FAIL (PartialRunError not exported), existing 7 tests still PASS

- [ ] **Step 3: Update `pipeline.ts`**

Replace the full contents of `apps/wrastlin/meta-service/src/agents/pipeline.ts` with:

```ts
import type { Wrestler, Manager, WeeklySubmission, Announcer } from '@org/wrastlin-shared';
import type {
  ShowOutlineInput,
  ShowOutlineAgentFn,
  MatchBeatsAgentFn,
  PromoScreenplayAgentFn,
  AnnouncerScreenplayAgentFn,
  GeneratedShow,
  GeneratedSegment,
  MatchOutlineSegment,
  PromoOutlineSegment,
  MatchBeats,
  PromoScreenplay,
} from './types.js';
import {
  buildMatchBeatsInput,
  buildPromoScreenplayInput,
  buildAnnouncerScreenplayInput,
} from './dataBuilders.js';

export class PartialRunError extends Error {
  constructor(public readonly failedSegmentIds: string[]) {
    super(`Pipeline failed for segments: ${failedSegmentIds.join(', ')}`);
  }
}

interface PipelineParams {
  showOutlineInput: ShowOutlineInput;
  wrestlers: Wrestler[];
  managers: Manager[];
  submissions: WeeklySubmission[];
  announcers: Announcer[];
  agents: {
    showOutline: ShowOutlineAgentFn;
    matchBeats: MatchBeatsAgentFn;
    promoScreenplay: PromoScreenplayAgentFn;
    announcerScreenplay: AnnouncerScreenplayAgentFn;
  };
}

// Intermediate types carry narrowed segment so no `as` casts are needed downstream
type MatchResult = { type: 'match'; segment: MatchOutlineSegment; beats: MatchBeats };
type PromoResult = { type: 'promo'; segment: PromoOutlineSegment; promoScreenplay: PromoScreenplay };
type SegmentResult = MatchResult | PromoResult;

export async function runShowPipeline(params: PipelineParams): Promise<GeneratedShow> {
  const { showOutlineInput, wrestlers, managers, submissions, announcers, agents } = params;

  // Step 1: Generate show outline (sequential — defines the segment list)
  const showOutline = await agents.showOutline(showOutlineInput);

  // Step 2: Process all segments in parallel — matches get beats, promos get screenplay
  const step2Settled = await Promise.allSettled(
    showOutline.segments.map(async (segment): Promise<SegmentResult> => {
      if (segment.type === 'match') {
        const input = buildMatchBeatsInput(segment, wrestlers, managers, submissions);
        const beats = await agents.matchBeats(input);
        return { type: 'match', segment, beats };
      } else {
        const input = buildPromoScreenplayInput(
          segment,
          wrestlers,
          showOutlineInput.week,
          announcers,
        );
        const promoScreenplay = await agents.promoScreenplay(input);
        return { type: 'promo', segment, promoScreenplay };
      }
    }),
  );

  const step2Failed: string[] = [];
  const segmentResults: SegmentResult[] = [];
  for (let i = 0; i < step2Settled.length; i++) {
    const result = step2Settled[i];
    if (result.status === 'fulfilled') {
      segmentResults.push(result.value);
    } else {
      step2Failed.push(showOutline.segments[i].segmentId);
    }
  }
  if (step2Failed.length > 0) throw new PartialRunError(step2Failed);

  // Step 3: Run announcer screenplays for match segments in parallel; promos pass through
  const step3Settled = await Promise.allSettled(
    segmentResults.map(async (result): Promise<GeneratedSegment> => {
      if (result.type === 'match') {
        const input = buildAnnouncerScreenplayInput(result.beats, announcers);
        const announcerScreenplay = await agents.announcerScreenplay(input);
        return { ...result.segment, beats: result.beats, announcerScreenplay };
      } else {
        return { ...result.segment, promoScreenplay: result.promoScreenplay };
      }
    }),
  );

  const step3Failed: string[] = [];
  const generatedSegments: GeneratedSegment[] = [];
  for (let i = 0; i < step3Settled.length; i++) {
    const result = step3Settled[i];
    if (result.status === 'fulfilled') {
      generatedSegments.push(result.value);
    } else {
      step3Failed.push(segmentResults[i].segment.segmentId);
    }
  }
  if (step3Failed.length > 0) throw new PartialRunError(step3Failed);

  // Sort by order field to match the show card
  generatedSegments.sort((a, b) => a.order - b.order);

  return { showOutline, segments: generatedSegments };
}
```

- [ ] **Step 4: Run all pipeline tests**

```bash
cd apps/wrastlin/meta-service && pnpm vitest run --reporter=verbose src/agents/pipeline.spec.ts
```

Expected: 9 tests PASS (7 existing + 2 new)

- [ ] **Step 5: Commit**

```bash
git add apps/wrastlin/meta-service/src/agents/pipeline.ts apps/wrastlin/meta-service/src/agents/pipeline.spec.ts
git commit -m "feat(wrastlin): pipeline uses Promise.allSettled with PartialRunError"
```

---

## Chunk 3: generate-show.ts rewrite

### Task 5: Rewrite `generate-show.ts` + gitignore `data/runs/`

**Files:**
- Modify: `apps/wrastlin/meta-service/src/generate-show.ts`
- Modify: `/Users/tawneypauling/Documents/git/social-games/.gitignore`

No unit test for the CLI entrypoint — manual testing with `--stub` covers it per the spec.

Key wiring detail for per-segment agents: `segmentId` is extracted from the input at call time using a closure, so the pipeline stays unaware of `OutboxRunner`:

```ts
matchBeats: (input) =>
  runner.wrap('matchBeats', input.segment.segmentId, baseAgents.matchBeats)(input),
promoScreenplay: (input) =>
  runner.wrap('promoScreenplay', input.segment.segmentId, baseAgents.promoScreenplay)(input),
announcerScreenplay: (input) =>
  runner.wrap('announcerScreenplay', input.matchBeats.segmentId, baseAgents.announcerScreenplay)(input),
```

`showOutline` uses `null` for segmentId (it has no segment context): `runner.wrap('showOutline', null, baseAgents.showOutline)`.

Path resolution: `RUNS_DIR = path.resolve(import.meta.dirname, '../data/runs')` — same pattern as `persistence.ts`.

`--resume <path>` argument is stored in `resumePath` (not `path`) to avoid shadowing the `node:path` import.

Real AI agents are not implemented yet — when `--stub` is omitted, exit with a clear error message.

- [ ] **Step 1: Add `data/runs/` to root `.gitignore`**

Add to `/Users/tawneypauling/Documents/git/social-games/.gitignore` after the `.env` entries:

```
# wrastlin show generation run logs
apps/wrastlin/meta-service/data/runs/
```

- [ ] **Step 2: Rewrite `generate-show.ts`**

Replace the full contents of `apps/wrastlin/meta-service/src/generate-show.ts` with:

```ts
import fs from 'node:fs';
import path from 'node:path';
import { loadWrestlers, loadManagers, loadState, loadSubmissions, loadAnnouncers } from './core/gameState.js';
import { transitionTo } from './core/weeklyOrchestrator.js';
import { writeDynamicJson as writeJson } from './data/persistence.js';
import { buildShowOutlineInput } from './agents/dataBuilders.js';
import { runShowPipeline, PartialRunError } from './agents/pipeline.js';
import { RunLog } from './agents/runLog.js';
import { OutboxRunner } from './agents/outboxRunner.js';
import { stubShowOutlineAgent } from './agents/stubs/stubShowOutlineAgent.js';
import { stubMatchBeatsAgent } from './agents/stubs/stubMatchBeatsAgent.js';
import { stubPromoScreenplayAgent } from './agents/stubs/stubPromoScreenplayAgent.js';
import { stubAnnouncerScreenplayAgent } from './agents/stubs/stubAnnouncerScreenplayAgent.js';
import type {
  GeneratedSegment,
  GeneratedMatchSegment,
  MatchBeatsInput,
  PromoScreenplayInput,
  AnnouncerScreenplayInput,
} from './agents/types.js';

// ── CLI args ───────────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const useStub = args.includes('--stub');
const resumeIndex = args.indexOf('--resume');
const resumePath = resumeIndex !== -1 ? args[resumeIndex + 1] : undefined;

// ── Paths ─────────────────────────────────────────────────────────────────────

const RUNS_DIR = path.resolve(import.meta.dirname, '../data/runs');

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeRunId(week: number): string {
  const ts = new Date().toISOString().replace(/[^0-9T]/g, '').slice(0, 15);
  return `week-${week}-${ts}`;
}

function formatSegment(seg: GeneratedSegment, nameMap: Map<string, string>): string {
  const names = seg.participants.map(id => nameMap.get(id) ?? id).join(' vs ');
  const lines = [`  [${seg.type.toUpperCase()}] ${names}`];
  if (seg.type === 'match') {
    const matchSeg = seg as GeneratedMatchSegment;
    const winner = nameMap.get(matchSeg.beats.result.winner) ?? matchSeg.beats.result.winner;
    lines.push(`    → Winner: ${winner} (${matchSeg.beats.result.finishType})`);
    lines.push(`    → Crowd: ${matchSeg.beats.result.crowdReaction}`);
  }
  return lines.join('\n');
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const state = loadState();
  if (state.phase !== 'submissions_closed') {
    console.error(`Cannot generate show: phase is '${state.phase}', expected 'submissions_closed'`);
    console.error('Run: curl -X POST http://localhost:3002/state/close-submissions');
    process.exit(1);
  }

  if (!useStub) {
    console.error('AI agents are not yet implemented. Use --stub for testing.');
    console.error('  pnpm nx run wrastlin-service:generate-show -- --stub');
    process.exit(1);
  }

  const week = state.currentWeek;
  console.log(`\n=== GENERATING SHOW FOR WEEK ${week} ===`);
  console.log(`Mode: stub agents`);

  const wrestlers = loadWrestlers();
  const managers = loadManagers();
  const submissions = loadSubmissions(week);
  const announcers = loadAnnouncers();

  // Set up run log
  let log: RunLog;
  if (resumePath) {
    const absResumePath = path.resolve(resumePath);
    if (!fs.existsSync(absResumePath)) {
      console.error(`Resume file not found: ${absResumePath}`);
      process.exit(1);
    }
    log = new RunLog(absResumePath);
    console.log(`\nResuming run: ${log.runId}`);
  } else {
    const runId = makeRunId(week);
    fs.mkdirSync(RUNS_DIR, { recursive: true });
    log = new RunLog(path.join(RUNS_DIR, `${runId}.jsonl`));
    log.append({
      type: 'run_started',
      runId: log.runId,
      week,
      mode: 'stub',
      timestamp: new Date().toISOString(),
    });
    console.log(`\nRun log: data/runs/${log.runId}.jsonl`);
  }

  const runner = new OutboxRunner(log);

  const baseAgents = {
    showOutline: stubShowOutlineAgent,
    matchBeats: stubMatchBeatsAgent,
    promoScreenplay: stubPromoScreenplayAgent,
    announcerScreenplay: stubAnnouncerScreenplayAgent,
  };

  // Per-segment agents extract segmentId from their input at call time
  const agents = {
    showOutline: runner.wrap('showOutline', null, baseAgents.showOutline),
    matchBeats: (input: MatchBeatsInput) =>
      runner.wrap('matchBeats', input.segment.segmentId, baseAgents.matchBeats)(input),
    promoScreenplay: (input: PromoScreenplayInput) =>
      runner.wrap('promoScreenplay', input.segment.segmentId, baseAgents.promoScreenplay)(input),
    announcerScreenplay: (input: AnnouncerScreenplayInput) =>
      runner.wrap('announcerScreenplay', input.matchBeats.segmentId, baseAgents.announcerScreenplay)(input),
  };

  const showOutlineInput = buildShowOutlineInput(week, wrestlers, managers, submissions, []);

  try {
    const show = await runShowPipeline({
      showOutlineInput,
      wrestlers,
      managers,
      submissions,
      announcers,
      agents,
    });

    writeJson(`shows/week-${week}.json`, show);
    transitionTo('show_generated');

    log.append({
      type: 'run_completed',
      runId: log.runId,
      showId: show.showOutline.showId,
      timestamp: new Date().toISOString(),
    });

    const nameMap = new Map(wrestlers.map(w => [w.wrestlerId, w.name]));
    console.log(`\nShow ID: ${show.showOutline.showId}`);
    console.log(`Week: ${show.showOutline.week}`);
    console.log('\nSEGMENTS:');
    show.segments.forEach(seg => console.log(formatSegment(seg, nameMap)));
    console.log(`\nShow saved to data/shows/week-${week}.json`);
    console.log(`State advanced to: show_generated`);
    console.log('\nTo start next week: curl -X POST http://localhost:3002/state/advance-week');

  } catch (err) {
    if (err instanceof PartialRunError) {
      log.append({
        type: 'run_failed',
        runId: log.runId,
        failedSegments: err.failedSegmentIds,
        timestamp: new Date().toISOString(),
      });
      console.error(`\nRun failed. Failed segments: ${err.failedSegmentIds.join(', ')}`);
      console.error(`\nTo resume: pnpm nx run wrastlin-service:generate-show -- --stub --resume data/runs/${log.runId}.jsonl`);
    } else {
      // Unexpected error (e.g. showOutline agent failed before parallel steps)
      log.append({
        type: 'run_failed',
        runId: log.runId,
        failedSegments: ['showOutline'],
        timestamp: new Date().toISOString(),
      });
      console.error('\nRun failed unexpectedly:', err instanceof Error ? err.message : String(err));
      console.error(`\nTo resume: pnpm nx run wrastlin-service:generate-show -- --stub --resume data/runs/${log.runId}.jsonl`);
    }
    process.exit(1);
  }
}

main().catch(err => { console.error(err); process.exit(1); });
```

- [ ] **Step 3: Run the full test suite to confirm nothing is broken**

```bash
pnpm nx run wrastlin-service:test
```

Expected: all tests PASS (the new `generate-show.ts` is not tested by vitest — it's a CLI script)

- [ ] **Step 4: Build to verify TypeScript compiles**

```bash
pnpm nx run wrastlin-service:build
```

Expected: build succeeds with no errors

- [ ] **Step 5: Smoke test with `--stub`**

First ensure the game state is in `submissions_closed` phase. If it's not, temporarily edit `data/runtime/state.json` to set `"phase": "submissions_closed"`, run the test, then restore it. Or use the API if the server is running.

```bash
pnpm nx run wrastlin-service:generate-show -- --stub
```

Expected output:
```
=== GENERATING SHOW FOR WEEK 1 ===
Mode: stub agents

Run log: data/runs/week-1-TIMESTAMP.jsonl

Show ID: stub-show-001
Week: 1

SEGMENTS:
  [PROMO] Wrestler w-001
  [MATCH] Wrestler w-003 vs Wrestler w-004
  [MATCH] Wrestler w-001 vs Wrestler w-002

Show saved to data/shows/week-1.json
State advanced to: show_generated

To start next week: curl -X POST http://localhost:3002/state/advance-week
```

Also verify the JSONL file was created at `data/runs/week-1-TIMESTAMP.jsonl` and contains the expected events.

- [ ] **Step 6: Commit**

```bash
git add apps/wrastlin/meta-service/src/generate-show.ts .gitignore
git commit -m "feat(wrastlin): wire runShowPipeline into generate-show with outbox + stub mode"
```
