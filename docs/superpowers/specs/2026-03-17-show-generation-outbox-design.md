# Show Generation Outbox Design

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan.

**Goal:** Wire `runShowPipeline` into `generate-show.ts` with stub/AI agent swapping, fault-tolerant JSONL outbox, and checkpoint-based resume on failure.

**Architecture:** An `OutboxRunner` wraps each agent function — it checks a completion map built from the JSONL on startup and returns cached outputs on resume; otherwise it calls the agent and appends `agent_started` / `agent_completed` / `agent_failed` events to the log. `runShowPipeline` switches its parallel steps to `Promise.allSettled` so in-flight segments finish before a failure propagates. `generate-show.ts` is the CLI entrypoint that wires everything together via `--stub` and `--resume` flags.

**Tech stack:** Node.js ESM, TypeScript, `node:fs` (append-only JSONL writes), existing stubs in `src/agents/stubs/`.

---

## Components

### `RunLog` (`src/agents/runLog.ts`)

Single responsibility: JSONL file I/O and completion map.

**On construction:**
- Accepts a file path (absolute)
- If the file exists (resume mode), reads it line-by-line and builds a `Map<string, unknown>` of `agent_completed` outputs keyed by `${agentType}:${segmentId ?? 'root'}`
- `agent_failed` entries are ignored — those segments will re-run

**Methods:**
- `append(entry: LogEntry): void` — JSON-serialises the entry and appends a newline to the file (synchronous `fs.appendFileSync` for simplicity)
- `getCompleted(agentType: AgentType, segmentId: string | null): unknown | undefined` — looks up the completion map
- `runId: string` — read-only, derived from the filename

**File location:** `data/runs/week-{N}-{YYYYMMDDTHHmmss}.jsonl`

**Path resolution:** `generate-show.ts` must resolve the `data/runs/` directory using `import.meta.dirname` (e.g. `path.resolve(import.meta.dirname, '../data/runs')`), matching the pattern used in `persistence.ts`. This ensures correct resolution from `dist/` at runtime. When `--resume <path>` is passed, the path is treated as relative to `process.cwd()` (which is `apps/wrastlin/meta-service` per `project.json`) — store it in a variable named `resumePath` and resolve it with `path.resolve(resumePath)` before passing to `RunLog`. Do not name the variable `path` — that shadows the `node:path` import.

---

### `OutboxRunner` (`src/agents/outboxRunner.ts`)

Wraps any agent function. Does NOT contain retry logic — that lives inside each agent.

**Constructor:** `new OutboxRunner(log: RunLog)`

**Method:** `wrap<TInput, TOutput>(agentType: AgentType, segmentId: string | null, agent: (input: TInput) => Promise<TOutput>): (input: TInput) => Promise<TOutput>`

**Behaviour per call:**
1. Check `log.getCompleted(agentType, segmentId)` — if found, return cached output immediately (no log writes)
2. Write `agent_started` event
3. Call `agent(input)`
4. On success: write `agent_completed` event with output, return output
5. On throw: write `agent_failed` event with `error.message`, re-throw

**Important — `segmentId` is bound at wrap time.** A new wrapped function must be created for each segment. Inside `pipeline.ts` `.map()` callbacks the intended pattern is:

```ts
// correct — new wrap per segment
const beats = await runner.wrap('matchBeats', segment.segmentId, agents.matchBeats)(input);

// WRONG — do not wrap once and reuse across segments
const wrappedBeats = runner.wrap('matchBeats', 'seg-1', agents.matchBeats);
// calling wrappedBeats with seg-2's input would cache under seg-1's key
```

---

### JSONL Entry Types

```ts
type AgentType = 'showOutline' | 'matchBeats' | 'promoScreenplay' | 'announcerScreenplay';

type LogEntry =
  | { type: 'run_started';    runId: string; week: number; mode: 'stub' | 'ai'; timestamp: string }
  | { type: 'agent_started';  runId: string; agentType: AgentType; segmentId: string | null; input: unknown; timestamp: string }
  | { type: 'agent_completed';runId: string; agentType: AgentType; segmentId: string | null; output: unknown; timestamp: string }
  | { type: 'agent_failed';   runId: string; agentType: AgentType; segmentId: string | null; error: string; timestamp: string }
  | { type: 'run_completed';  runId: string; showId: string; timestamp: string }
  | { type: 'run_failed';     runId: string; failedSegments: string[]; timestamp: string };
```

Cache key: `${agentType}:${segmentId ?? 'root'}`

---

### `runShowPipeline` changes (`src/agents/pipeline.ts`)

**Change `Promise.all` → `Promise.allSettled`** in both parallel steps (step 2 and step 3).

After each `Promise.allSettled`, collect rejected results. If any exist, throw `PartialRunError` with the list of failed segment IDs. This lets all in-flight parallel segments finish before the run stops.

```ts
export class PartialRunError extends Error {
  constructor(public readonly failedSegmentIds: string[]) {
    super(`Pipeline failed for segments: ${failedSegmentIds.join(', ')}`);
  }
}
```

---

### `generate-show.ts` changes

**CLI flags:**
```bash
# Fresh run, stub agents
pnpm nx run wrastlin-service:generate-show -- --stub

# Fresh run, real AI agents (when implemented)
pnpm nx run wrastlin-service:generate-show

# Resume a failed run
pnpm nx run wrastlin-service:generate-show -- --stub --resume data/runs/week-3-20260317T142000.jsonl
```

**Flow:**
1. Parse `--stub` and `--resume <path>` from `process.argv`
2. Guard: phase must be `submissions_closed`
3. Load world data: wrestlers, managers, submissions, announcers
   - `loadWrestlers`, `loadManagers`, `loadSubmissions` already exist in `gameState.ts`
   - `loadAnnouncers` does NOT exist yet — add it to `gameState.ts` reading `data/static/announcers.json` using `readStaticJson` only (no dynamic fallback — announcers are static editorial data, not runtime-mutable); add a unit test alongside the existing `gameState` tests
4. If `--resume <path>`: construct `RunLog` from existing file (loads completion map)
5. If not: construct `RunLog` at `data/runs/week-{N}-{timestamp}.jsonl`, append `run_started`
6. Select agents: stubs if `--stub`, real AI agents otherwise
7. Wrap each agent with `OutboxRunner.wrap()`
8. Call `buildShowOutlineInput` + `runShowPipeline` with wrapped agents
9. On success: save show to `data/shows/week-N.json`, call `transitionTo('show_generated')`, append `run_completed`, print show card, print the advance-week hint (`curl -X POST http://localhost:3002/state/advance-week`)
10. On `PartialRunError`: append `run_failed`, print failed segment IDs and the run file path for `--resume`

---

## File Structure

```
apps/wrastlin/meta-service/
  src/
    agents/
      runLog.ts              NEW
      outboxRunner.ts        NEW
      pipeline.ts            MODIFY — Promise.allSettled + PartialRunError
    generate-show.ts         MODIFY — --stub / --resume, wires RunLog + OutboxRunner
  data/
    runs/                    NEW dir (gitignored) — JSONL run files
```

---

## Error Handling

| Scenario | Behaviour |
|---|---|
| Agent fails, exhausts own retries | Agent throws; OutboxRunner writes `agent_failed`; re-throws |
| Any segment in parallel step fails | Other in-flight segments finish; pipeline throws `PartialRunError` |
| `PartialRunError` caught in CLI | `run_failed` written; path to run file printed; exit code 1 |
| Unexpected error (e.g. `showOutline` agent fails before parallel steps) | `generate-show.ts` catches in a top-level `try/catch`; writes `run_failed` with `failedSegments: ['showOutline']`; exit code 1 |
| Resume with all segments complete | All agent calls return from cache; pipeline completes normally |
| Resume with partial completions | Cached segments skipped; only incomplete segments re-run |

---

## Testing

- `runLog.spec.ts` — unit tests: append entries, load existing file, build completion map, ignore `agent_failed` entries
- `outboxRunner.spec.ts` — unit tests: returns cached output without calling agent; calls agent on cache miss; writes correct events; re-throws on agent failure
- `pipeline.spec.ts` — existing tests updated: verify `PartialRunError` thrown when a stub agent rejects; verify successful segments still return

No integration test needed for the CLI entrypoint — manual testing with `--stub` covers it.
