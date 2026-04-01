# promptfoo Show Outline Agent Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Set up promptfoo as a prompt engineering harness for the show-outline agent, with structural JS assertions, LLM-as-judge assertions, and probabilistic repeat testing.

**Architecture:** A `promptfoo/` directory inside `meta-service` contains the config, a CJS assertion module, and generated vars JSON files. A build script (`build-promptfoo-vars.mjs`) reads `data/scenarios/outline/` and writes projected/joined vars. Two NX targets (`build-promptfoo-vars`, `promptfoo`) wire it all together.

**Tech Stack:** promptfoo (eval + web UI), OpenAI gpt-4o, Node ESM scripts, vitest for assertion unit tests.

---

## File Map

| Action | Path | Purpose |
|--------|------|---------|
| Modify | `package.json` (root) | Add `promptfoo` devDependency |
| Modify | `apps/wrastlin/meta-service/project.json` | Add `build-promptfoo-vars` + `promptfoo` NX targets |
| Modify | `apps/wrastlin/meta-service/vitest.config.mts` | Expand test `include` to pick up `promptfoo/**/*.spec.ts` |
| Create | `apps/wrastlin/meta-service/scripts/build-promptfoo-vars.mjs` | Projects + joins scenario data into promptfoo vars |
| Create | `apps/wrastlin/meta-service/promptfoo/promptfooconfig.yaml` | promptfoo config: prompts, provider, test cases |
| Create | `apps/wrastlin/meta-service/promptfoo/assertions/bookingRules.mjs` | JS assertion: structural + booking rules |
| Create | `apps/wrastlin/meta-service/promptfoo/assertions/bookingRules.spec.ts` | Vitest unit tests for the assertion function |
| Generate | `apps/wrastlin/meta-service/promptfoo/vars/stacked-requests/wrestlers.json` | Created by build script |
| Generate | `apps/wrastlin/meta-service/promptfoo/vars/stacked-requests/submissions.json` | Created by build script |
| Generate | `apps/wrastlin/meta-service/promptfoo/vars/bribing/wrestlers.json` | Created by build script |
| Generate | `apps/wrastlin/meta-service/promptfoo/vars/bribing/submissions.json` | Created by build script |

---

## Task 1: Install promptfoo

**Files:**
- Modify: `package.json` (root)

- [ ] **Step 1: Add promptfoo to root package.json devDependencies**

Open `/Users/tawneypauling/Documents/git/social-games/package.json` and add `"promptfoo": "^0.105.0"` to `devDependencies`.

- [ ] **Step 2: Install in a real terminal**

Run this in a real terminal (not a background task — pnpm hangs in non-TTY):
```bash
pnpm install
```

- [ ] **Step 3: Verify install**
```bash
pnpm exec promptfoo --version
```
Expected: a version string like `0.105.x`

- [ ] **Step 4: Commit**
```bash
git add package.json pnpm-lock.yaml
git commit -m "chore: add promptfoo devDependency"
```

---

## Task 2: Add NX targets

**Files:**
- Modify: `apps/wrastlin/meta-service/project.json`

- [ ] **Step 1: Add two targets to project.json**

Add the following inside the `"targets"` object in `apps/wrastlin/meta-service/project.json`:

```json
"build-promptfoo-vars": {
  "executor": "nx:run-commands",
  "options": {
    "command": "node scripts/build-promptfoo-vars.mjs",
    "cwd": "apps/wrastlin/meta-service"
  }
},
"promptfoo": {
  "executor": "nx:run-commands",
  "options": {
    "command": "pnpm exec promptfoo eval -c promptfoo/promptfooconfig.yaml",
    "cwd": "apps/wrastlin/meta-service"
  }
}
```

- [ ] **Step 2: Verify NX sees the new targets**
```bash
pnpm nx show project wrastlin-service
```
Expected: `build-promptfoo-vars` and `promptfoo` appear in the targets list.

- [ ] **Step 3: Commit**
```bash
git add apps/wrastlin/meta-service/project.json
git commit -m "chore(wrastlin): add build-promptfoo-vars and promptfoo NX targets"
```

---

## Task 3: Write the vars build script

**Files:**
- Create: `apps/wrastlin/meta-service/scripts/build-promptfoo-vars.mjs`

- [ ] **Step 1: Create the script**

Create `apps/wrastlin/meta-service/scripts/build-promptfoo-vars.mjs`:

```js
#!/usr/bin/env node
/**
 * Reads each data/scenarios/outline/<name>/ folder and writes
 * promptfoo/vars/<name>/wrestlers.json + submissions.json.
 *
 * Replicates the same projection + manager-join logic as
 * buildShowOutlineInput() in src/agents/dataBuilders.ts.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const metaServiceDir = path.resolve(__dirname, '..');
const scenariosDir = path.join(metaServiceDir, 'data', 'scenarios', 'outline');
const varsDir = path.join(metaServiceDir, 'promptfoo', 'vars');

const entries = fs.readdirSync(scenariosDir, { withFileTypes: true });
const scenarioNames = entries
  .filter(e => e.isDirectory())
  .map(e => e.name);

for (const name of scenarioNames) {
  const scenarioDir = path.join(scenariosDir, name);

  const wrestlers = JSON.parse(fs.readFileSync(path.join(scenarioDir, 'wrestlers.json'), 'utf-8'));
  const managers  = JSON.parse(fs.readFileSync(path.join(scenarioDir, 'managers.json'),  'utf-8'));
  const submissions = JSON.parse(fs.readFileSync(path.join(scenarioDir, 'submissions.json'), 'utf-8'));

  // WrestlerSummaryForOutline — only the fields the prompt needs
  const wrestlerSummaries = wrestlers.map(w => ({
    wrestlerId:     w.wrestlerId,
    name:           w.name,
    gimmick:        w.gimmick,
    emotionalState: w.emotionalState,
  }));

  // SubmissionSummaryForOutline — join submission with manager to get wrestlerId
  const submissionSummaries = submissions
    .map(sub => {
      const manager = managers.find(m => m.managerId === sub.managerId);
      if (!manager) return null;
      return {
        managerId:   sub.managerId,
        wrestlerId:  manager.wrestlerId,
        showRequest: sub.showRequest,
        bribeAmount: sub.bribeAmount,
      };
    })
    .filter(Boolean);

  const outDir = path.join(varsDir, name);
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(
    path.join(outDir, 'wrestlers.json'),
    JSON.stringify(wrestlerSummaries, null, 2),
  );
  fs.writeFileSync(
    path.join(outDir, 'submissions.json'),
    JSON.stringify(submissionSummaries, null, 2),
  );

  console.log(`✓ ${name}: ${wrestlerSummaries.length} wrestlers, ${submissionSummaries.length} submissions`);
}

console.log('Done.');
```

- [ ] **Step 2: Run the script**
```bash
pnpm nx run wrastlin-service:build-promptfoo-vars
```
Expected output:
```
✓ bribing: 7 wrestlers, 7 submissions
✓ stacked-requests: 10 wrestlers, 10 submissions
Done.
```

- [ ] **Step 3: Verify generated files exist and look correct**
```bash
cat apps/wrastlin/meta-service/promptfoo/vars/stacked-requests/wrestlers.json
```
Expected: JSON array of 10 objects, each with only `wrestlerId`, `name`, `gimmick`, `emotionalState` (no `stats`, `personality`, etc.).

```bash
cat apps/wrastlin/meta-service/promptfoo/vars/stacked-requests/submissions.json
```
Expected: JSON array of 10 objects, each with `managerId`, `wrestlerId`, `showRequest`, `bribeAmount`.

- [ ] **Step 4: Commit everything**
```bash
git add apps/wrastlin/meta-service/scripts/build-promptfoo-vars.mjs \
        apps/wrastlin/meta-service/promptfoo/vars/
git commit -m "feat(wrastlin): add build-promptfoo-vars script and generated promptfoo vars"
```

---

## Task 4: Write the booking rules assertion (TDD)

**Files:**
- Create: `apps/wrastlin/meta-service/promptfoo/assertions/bookingRules.mjs`
- Create: `apps/wrastlin/meta-service/promptfoo/assertions/bookingRules.spec.ts`
- Modify: `apps/wrastlin/meta-service/vitest.config.mts`

- [ ] **Step 1: Expand vitest include to cover promptfoo specs**

In `apps/wrastlin/meta-service/vitest.config.mts`, change:
```ts
include: ['src/**/*.spec.ts'],
```
to:
```ts
include: ['src/**/*.spec.ts', 'promptfoo/**/*.spec.ts'],
```

- [ ] **Step 2: Write the failing tests**

Create `apps/wrastlin/meta-service/promptfoo/assertions/bookingRules.spec.ts`:

```ts
import { describe, it, expect } from 'vitest';
import bookingRules from './bookingRules.mjs';

// Minimal valid show outline
const validShow = {
  showId: '550e8400-e29b-41d4-a716-446655440000',
  week: 1,
  segments: [
    {
      segmentId: 'seg-001',
      order: 1,
      type: 'promo',
      participants: ['w-001'],
      goal: 'hype self',
    },
    {
      segmentId: 'seg-002',
      order: 2,
      type: 'match',
      matchType: 'singles',
      participants: [['w-003'], ['w-004']],
      interference: [],
      headliner: false,
    },
    {
      segmentId: 'seg-003',
      order: 3,
      type: 'match',
      matchType: 'singles',
      participants: [['w-001'], ['w-002']],
      interference: [],
      headliner: true,
    },
  ],
};

function output(show: object): string {
  return JSON.stringify(show);
}

describe('bookingRules assertion', () => {
  it('passes a valid show outline', () => {
    const result = bookingRules(output(validShow), { vars: {} });
    expect(result.pass).toBe(true);
  });

  it('strips markdown fences before parsing', () => {
    const fenced = '```json\n' + output(validShow) + '\n```';
    const result = bookingRules(fenced, { vars: {} });
    expect(result.pass).toBe(true);
  });

  it('fails when output is not valid JSON', () => {
    const result = bookingRules('not json at all', { vars: {} });
    expect(result.pass).toBe(false);
    expect(result.reason).toMatch(/not valid JSON/i);
  });

  it('fails when showId is missing', () => {
    const show = { ...validShow, showId: undefined };
    const result = bookingRules(output(show), { vars: {} });
    expect(result.pass).toBe(false);
    expect(result.reason).toMatch(/showId/i);
  });

  it('fails when week is not a number', () => {
    const show = { ...validShow, week: '1' };
    const result = bookingRules(output(show), { vars: {} });
    expect(result.pass).toBe(false);
    expect(result.reason).toMatch(/week/i);
  });

  it('fails when segment count is below 3', () => {
    const show = { ...validShow, segments: validShow.segments.slice(0, 2) };
    const result = bookingRules(output(show), { vars: {} });
    expect(result.pass).toBe(false);
    expect(result.reason).toMatch(/3.5 segments/i);
  });

  it('fails when segment count exceeds 5', () => {
    const extraSegment = { ...validShow.segments[1], segmentId: 'seg-extra', order: 4, participants: [['w-005'], ['w-006']] };
    const extraSegment2 = { ...validShow.segments[1], segmentId: 'seg-extra2', order: 5, participants: [['w-007'], ['w-008']] };
    const extraSegment3 = { ...validShow.segments[1], segmentId: 'seg-extra3', order: 6, participants: [['w-009'], ['w-010']] };
    const show = { ...validShow, segments: [...validShow.segments, extraSegment, extraSegment2, extraSegment3] };
    const result = bookingRules(output(show), { vars: {} });
    expect(result.pass).toBe(false);
    expect(result.reason).toMatch(/3.5 segments/i);
  });

  it('fails when there are no promos', () => {
    const show = {
      ...validShow,
      segments: [
        { segmentId: 'seg-001', order: 1, type: 'match', matchType: 'singles', participants: [['w-003'], ['w-004']], interference: [], headliner: false },
        { segmentId: 'seg-002', order: 2, type: 'match', matchType: 'singles', participants: [['w-005'], ['w-006']], interference: [], headliner: false },
        { segmentId: 'seg-003', order: 3, type: 'match', matchType: 'singles', participants: [['w-001'], ['w-002']], interference: [], headliner: true },
      ],
    };
    const result = bookingRules(output(show), { vars: {} });
    expect(result.pass).toBe(false);
    expect(result.reason).toMatch(/promo/i);
  });

  it('fails when there is only one match', () => {
    const show = {
      ...validShow,
      segments: [
        { segmentId: 'seg-001', order: 1, type: 'promo', participants: ['w-001'], goal: 'hype' },
        { segmentId: 'seg-002', order: 2, type: 'promo', participants: ['w-002'], goal: 'hype' },
        { segmentId: 'seg-003', order: 3, type: 'match', matchType: 'singles', participants: [['w-001'], ['w-002']], interference: [], headliner: true },
      ],
    };
    const result = bookingRules(output(show), { vars: {} });
    expect(result.pass).toBe(false);
    expect(result.reason).toMatch(/2 match/i);
  });

  it('fails when there is no headliner', () => {
    const show = {
      ...validShow,
      segments: validShow.segments.map(s =>
        s.type === 'match' ? { ...s, headliner: false } : s,
      ),
    };
    const result = bookingRules(output(show), { vars: {} });
    expect(result.pass).toBe(false);
    expect(result.reason).toMatch(/headliner/i);
  });

  it('fails when there are two headliners', () => {
    const show = {
      ...validShow,
      segments: validShow.segments.map(s =>
        s.type === 'match' ? { ...s, headliner: true } : s,
      ),
    };
    const result = bookingRules(output(show), { vars: {} });
    expect(result.pass).toBe(false);
    expect(result.reason).toMatch(/headliner/i);
  });

  it('fails when headliner is not the last segment', () => {
    const show = {
      ...validShow,
      segments: [
        { segmentId: 'seg-001', order: 1, type: 'match', matchType: 'singles', participants: [['w-001'], ['w-002']], interference: [], headliner: true },
        { segmentId: 'seg-002', order: 2, type: 'promo', participants: ['w-003'], goal: 'hype' },
        { segmentId: 'seg-003', order: 3, type: 'match', matchType: 'singles', participants: [['w-004'], ['w-005']], interference: [], headliner: false },
      ],
    };
    const result = bookingRules(output(show), { vars: {} });
    expect(result.pass).toBe(false);
    expect(result.reason).toMatch(/last segment/i);
  });

  it('fails when match participants is a flat array instead of array-of-arrays', () => {
    const show = {
      ...validShow,
      segments: validShow.segments.map(s =>
        s.segmentId === 'seg-003'
          ? { ...s, participants: ['w-001', 'w-002'] }  // flat — wrong format
          : s,
      ),
    };
    const result = bookingRules(output(show), { vars: {} });
    expect(result.pass).toBe(false);
    expect(result.reason).toMatch(/array-of-arrays/i);
  });

  it('fails when a wrestler appears in two matches', () => {
    const show = {
      ...validShow,
      segments: [
        validShow.segments[0], // promo
        { segmentId: 'seg-002', order: 2, type: 'match', matchType: 'singles', participants: [['w-001'], ['w-003']], interference: [], headliner: false },
        { segmentId: 'seg-003', order: 3, type: 'match', matchType: 'singles', participants: [['w-001'], ['w-002']], interference: [], headliner: true }, // w-001 again
      ],
    };
    const result = bookingRules(output(show), { vars: {} });
    expect(result.pass).toBe(false);
    expect(result.reason).toMatch(/multiple matches/i);
  });
});
```

- [ ] **Step 3: Run the tests — verify they fail**
```bash
pnpm nx test wrastlin-service -- --reporter=verbose 2>&1 | grep -E "bookingRules|PASS|FAIL|✓|×"
```
Expected: all 13 tests FAIL because `bookingRules.mjs` doesn't exist yet.

- [ ] **Step 4: Create the assertion function**

Create `apps/wrastlin/meta-service/promptfoo/assertions/bookingRules.mjs`:

```js
/**
 * promptfoo JavaScript assertion for show-outline structural rules.
 *
 * Signature: (output: string, context: { vars: Record<string, string> })
 *   => { pass: boolean, score: number, reason: string }
 *
 * Checks:
 *  - Output is valid JSON (markdown fences stripped if present)
 *  - Required top-level fields: showId (string), week (number), segments (array)
 *  - 3–5 segments total
 *  - At least 1 promo, at least 2 matches
 *  - Exactly 1 headliner: true match
 *  - Headliner is the last segment
 *  - Match participants are array-of-arrays: [["w-001"], ["w-002"]]
 *  - No wrestler ID appears in more than one match
 */
export default function bookingRules(output, _context) {
  const failures = [];

  // Strip markdown fences if present
  const cleaned = output
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/, '')
    .trim();

  let parsed;
  try {
    parsed = JSON.parse(cleaned);
  } catch (e) {
    return { pass: false, score: 0, reason: `Output is not valid JSON: ${e.message}` };
  }

  // Required top-level fields
  if (typeof parsed.showId !== 'string' || !parsed.showId) {
    failures.push('Missing or invalid showId (must be a non-empty string)');
  }
  if (typeof parsed.week !== 'number') {
    failures.push('Missing or invalid week (must be a number)');
  }
  if (!Array.isArray(parsed.segments)) {
    return { pass: false, score: 0, reason: 'Missing segments array' };
  }

  const segments = parsed.segments;

  // 3–5 segments
  if (segments.length < 3 || segments.length > 5) {
    failures.push(`Expected 3–5 segments, got ${segments.length}`);
  }

  const matches = segments.filter(s => s.type === 'match');
  const promos  = segments.filter(s => s.type === 'promo');

  if (promos.length < 1)  failures.push('Must have at least 1 promo');
  if (matches.length < 2) failures.push('Must have at least 2 matches');

  // Exactly one headliner
  const headliners = matches.filter(s => s.headliner === true);
  if (headliners.length !== 1) {
    failures.push(`Expected exactly 1 headliner:true match, got ${headliners.length}`);
  }

  // Headliner must be last segment
  if (headliners.length === 1 && segments[segments.length - 1] !== headliners[0]) {
    failures.push('Headliner must be the last segment');
  }

  // Match participants: array-of-arrays
  for (const match of matches) {
    if (!Array.isArray(match.participants)) {
      failures.push(`Match ${match.segmentId ?? '?'}: participants must be an array`);
      continue;
    }
    for (const team of match.participants) {
      if (!Array.isArray(team)) {
        failures.push(
          `Match ${match.segmentId ?? '?'}: participants must be array-of-arrays e.g. [["w-001"],["w-002"]]`,
        );
        break;
      }
    }
  }

  // No wrestler in more than one match
  const booked = new Set();
  for (const match of matches) {
    if (!Array.isArray(match.participants)) continue;
    for (const team of match.participants) {
      if (!Array.isArray(team)) continue;
      for (const wid of team) {
        if (booked.has(wid)) {
          failures.push(`Wrestler ${wid} is booked in multiple matches`);
        }
        booked.add(wid);
      }
    }
  }

  if (failures.length === 0) {
    return { pass: true, score: 1, reason: 'All structural booking rules passed' };
  }
  return {
    pass: false,
    score: 0,
    reason: `Booking rule violations:\n- ${failures.join('\n- ')}`,
  };
}
```

- [ ] **Step 5: Run tests — verify they pass**
```bash
pnpm nx test wrastlin-service -- --reporter=verbose 2>&1 | grep -E "bookingRules|PASS|FAIL|✓|×"
```
Expected: all 13 tests pass.

- [ ] **Step 6: Commit**
```bash
git add apps/wrastlin/meta-service/vitest.config.mts \
        apps/wrastlin/meta-service/promptfoo/assertions/
git commit -m "feat(wrastlin): add bookingRules promptfoo assertion with vitest coverage"
```

---

## Task 5: Write promptfooconfig.yaml

**Files:**
- Create: `apps/wrastlin/meta-service/promptfoo/promptfooconfig.yaml`

- [ ] **Step 1: Create the config**

Create `apps/wrastlin/meta-service/promptfoo/promptfooconfig.yaml`:

```yaml
description: Show Outline Agent — prompt engineering tests

prompts:
  - ../prompts/show-outline.md

providers:
  - id: openai:gpt-4o
    config:
      temperature: 0
      max_tokens: 2048

tests:
  - description: "stacked-requests: two managers stack requests for the same matchup"
    vars:
      WEEK: "1"
      PREVIOUS_OUTLINES_JSON: "[]"
      WRESTLERS_JSON: "file://vars/stacked-requests/wrestlers.json"
      SUBMISSIONS_JSON: "file://vars/stacked-requests/submissions.json"
    assert:
      - type: javascript
        value: "file://assertions/bookingRules.mjs"
      - type: llm-rubric
        value: >
          The show request with the highest effective bribe became the headliner.
          (Effective bribe = sum of bribeAmounts when two managers request the same
          matchup — a "stacked" request.) Given the SUBMISSIONS_JSON context and
          the output, was booking priority correctly followed?
      - type: llm-rubric
        value: >
          Each promo segment has exactly one stated goal: either self-hype OR
          targeting a rival — not both simultaneously.

  - description: "bribing: $2000 bid wins headliner in at least 8 of 10 runs"
    vars:
      WEEK: "1"
      PREVIOUS_OUTLINES_JSON: "[]"
      WRESTLERS_JSON: "file://vars/bribing/wrestlers.json"
      SUBMISSIONS_JSON: "file://vars/bribing/submissions.json"
    options:
      numRepeat: 10
    assert:
      - type: javascript
        value: "file://assertions/bookingRules.mjs"
        threshold: 1.0
      - type: llm-rubric
        value: >
          The wrestler managed by m-007 (wrestlerId w-007, known as "Golden Tyrant")
          is in the headliner match. Their manager submitted a $2000 bribe, by far
          the highest in the card. Was this honored?
        threshold: 0.8
```

> **Note on `threshold` with `numRepeat`:** `threshold: 0.8` on the llm-rubric means each individual run must score ≥ 0.8. With `numRepeat: 10`, you get 10 independent evaluations. The pass rate across those 10 runs is visible in the promptfoo UI and summary. This is the mechanism for catching "the model ignores this rule sometimes."

- [ ] **Step 2: Commit**
```bash
git add apps/wrastlin/meta-service/promptfoo/promptfooconfig.yaml
git commit -m "feat(wrastlin): add promptfooconfig.yaml with show-outline test cases"
```

---

## Task 6: First run and smoke test

**Files:** (no changes — this is a verification task)

- [ ] **Step 1: Confirm OPENAI_API_KEY is set**

Make sure `apps/wrastlin/meta-service/.env` has `OPENAI_API_KEY=<your key>`.

promptfoo reads env vars from the process environment. Either export the key or prefix the command:
```bash
export OPENAI_API_KEY=$(grep OPENAI_API_KEY apps/wrastlin/meta-service/.env | cut -d= -f2)
```

- [ ] **Step 2: Run the eval**
```bash
pnpm nx run wrastlin-service:promptfoo
```

The `bribing` scenario runs 10 times, so this takes a few minutes. Expected output ends with a summary table like:
```
┌─────────────────────────────────────────────────────────┐
│ Eval Results                                            │
│ stacked-requests   3/3 passed                           │
│ bribing            ≥8/10 js passed, ≥8/10 rubric passed │
└─────────────────────────────────────────────────────────┘
```

Pass rates will vary. A first run with 100% JS pass and ≥70% rubric pass is a good baseline.

- [ ] **Step 3: Open the web UI to inspect outputs**
```bash
pnpm exec promptfoo view
```

Opens a local browser UI showing each run's output and which assertions passed/failed. Useful for understanding *why* a rubric failed.

- [ ] **Step 4: If any structural JS assertions fail**

The JS assertion prints the exact rule that failed in `reason`. Common first-run issues:

| Failure | Likely cause |
|---------|-------------|
| `participants must be array-of-arrays` | Model returned `["w-001","w-002"]` instead of `[["w-001"],["w-002"]]` |
| `Headliner must be the last segment` | Model put headliner in middle of card |
| `Output is not valid JSON` | Model included prose before/after JSON |

For any of these, tighten the rule in `prompts/show-outline.md` and re-run. The assertion suite will immediately confirm whether the fix worked.

- [ ] **Step 5: Commit a run-notes file** (optional, but useful)

If you want to track baseline pass rates for comparison:
```bash
pnpm nx run wrastlin-service:promptfoo 2>&1 | tail -30 > promptfoo/run-notes.txt
git add promptfoo/run-notes.txt
git commit -m "chore(wrastlin): add initial promptfoo baseline run notes"
```

---

## Ongoing: Adding a new prompt rule

When you add a new rule to `prompts/show-outline.md`, add a corresponding assertion to `promptfooconfig.yaml` at the same time:

- **Structural/countable rule** → add a check to `bookingRules.mjs` + a test in `bookingRules.spec.ts`
- **Soft/narrative rule** → add a `llm-rubric` assertion directly in `promptfooconfig.yaml`

## Ongoing: Adding a new scenario

```bash
# 1. Create the scenario data
mkdir -p apps/wrastlin/meta-service/data/scenarios/outline/my-scenario
# ... add wrestlers.json, managers.json, submissions.json

# 2. Regenerate vars
pnpm nx run wrastlin-service:build-promptfoo-vars

# 3. Add a test case to promptfoo/promptfooconfig.yaml
# 4. Commit both the scenario data and generated vars
```
