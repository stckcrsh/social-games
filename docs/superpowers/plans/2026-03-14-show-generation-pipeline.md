# Show Generation Pipeline Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the show generation pipeline infrastructure — types, prompt template files, data builders, stub agents, and pipeline orchestrator — fully testable without calling an AI model.

**Architecture:** Pure TypeScript modules in `apps/wrastlin/meta-service/src/agents/`. The pipeline accepts injected agent functions, enabling stub agents for testing and real AI agents later. Data builders are pure functions (no I/O). The prompt loader reads `.md` template files from `apps/wrastlin/meta-service/prompts/` and interpolates `{{PLACEHOLDER}}` tokens.

**Tech Stack:** TypeScript (ESM), vitest 3, Node.js 24, `@org/wrastlin-shared` types

**Spec:** `docs/superpowers/specs/2026-03-14-show-generation-prompts-design.md`

> **Worktree required:** Before starting Task 1, use `superpowers:using-git-worktrees` to create an isolated worktree. Never commit directly to `main`.

---

## File Map

| File | Create / Modify | Responsibility |
|------|----------------|----------------|
| `libs/wrastlin/shared/src/types/wrestler.ts` | Modify | Add `finisher: string` field |
| `libs/wrastlin/shared/src/types/announcer.ts` | Create | `Announcer` interface |
| `libs/wrastlin/shared/src/index.ts` | Modify | Export announcer type |
| `apps/wrastlin/meta-service/data/static/wrestlers.json` | Modify | Add finisher to each wrestler |
| `apps/wrastlin/meta-service/data/static/announcers.json` | Create | Two sample announcer personas |
| `apps/wrastlin/meta-service/src/agents/types.ts` | Create | All agent input/output TypeScript types |
| `apps/wrastlin/meta-service/prompts/show-outline.md` | Create | Agent 1 prompt template |
| `apps/wrastlin/meta-service/prompts/match-beats.md` | Create | Agent 2 prompt template |
| `apps/wrastlin/meta-service/prompts/promo-screenplay.md` | Create | Agent 3 prompt template |
| `apps/wrastlin/meta-service/prompts/announcer-screenplay.md` | Create | Agent 4 prompt template |
| `apps/wrastlin/meta-service/src/agents/promptLoader.ts` | Create | Load `.md` file + interpolate `{{PLACEHOLDER}}` tokens |
| `apps/wrastlin/meta-service/src/agents/promptLoader.spec.ts` | Create | Tests for `interpolate` function |
| `apps/wrastlin/meta-service/src/agents/dataBuilders.ts` | Create | Pure functions: rivalryHeat + all 4 input payload builders |
| `apps/wrastlin/meta-service/src/agents/dataBuilders.spec.ts` | Create | Tests for all data builder functions |
| `apps/wrastlin/meta-service/src/agents/stubs/stubShowOutlineAgent.ts` | Create | Returns hardcoded ShowOutline fixture |
| `apps/wrastlin/meta-service/src/agents/stubs/stubMatchBeatsAgent.ts` | Create | Returns hardcoded MatchBeats fixture |
| `apps/wrastlin/meta-service/src/agents/stubs/stubPromoScreenplayAgent.ts` | Create | Returns hardcoded PromoScreenplay fixture |
| `apps/wrastlin/meta-service/src/agents/stubs/stubAnnouncerScreenplayAgent.ts` | Create | Returns hardcoded AnnouncerScreenplay fixture |
| `apps/wrastlin/meta-service/src/agents/pipeline.ts` | Create | Orchestrates 4 agents into GeneratedShow |
| `apps/wrastlin/meta-service/src/agents/pipeline.spec.ts` | Create | Integration test using stub agents |

**Not in scope:** The actual AI agent callers (using the Anthropic SDK to call Claude). Those are a follow-up once the audio generation tool and model choice are finalized.

---

## Test setup

Tests live in `apps/wrastlin/meta-service/src/`. Run with:

```bash
pnpm nx test wrastlin-service
```

The vitest config is at `apps/wrastlin/meta-service/vitest.config.mts`. Key settings:
- `globals: false` — import from `'vitest'` explicitly in every test file
- `pool: 'forks'`
- `include: ['src/**/*.spec.ts']`
- Path aliases: `@org/wrastlin-shared` → `libs/wrastlin/shared/src/index.ts`

---

## Chunk 1: Types and static data

### Task 1: Add `finisher` to Wrestler type and update static wrestler data

**Files:**
- Modify: `libs/wrastlin/shared/src/types/wrestler.ts`
- Modify: `apps/wrastlin/meta-service/data/static/wrestlers.json`

- [ ] **Step 1: Add `finisher: string` to the Wrestler interface**

In `libs/wrastlin/shared/src/types/wrestler.ts`, add `finisher` after `managerTrust`:

```typescript
export interface Wrestler {
  wrestlerId: string;
  name: string;
  gimmick: string;
  stats: WrestlerStats;
  personality: WrestlerPersonality;
  emotionalState: WrestlerEmotions;
  relationships: Relationship[];
  memories: Memory[];
  managerTrust: number; // 1-10
  finisher: string;
}
```

- [ ] **Step 2: Add `finisher` to every wrestler in `data/static/wrestlers.json`**

Replace the file contents with:

```json
[
  {
    "wrestlerId": "w-001",
    "name": "Rex Dominion",
    "gimmick": "The Arrogant Champion",
    "stats": { "strength": 80, "agility": 60, "endurance": 75, "charisma": 70 },
    "personality": { "ego": 9, "anger": 7, "honor": 2, "loyalty": 3, "ambition": 8 },
    "emotionalState": { "confidence": 9, "frustration": 2, "fatigue": 3 },
    "relationships": [],
    "memories": [],
    "managerTrust": 4,
    "finisher": "Dominion Driver"
  },
  {
    "wrestlerId": "w-002",
    "name": "Steel Purity",
    "gimmick": "The Honorable Warrior",
    "stats": { "strength": 75, "agility": 65, "endurance": 80, "charisma": 65 },
    "personality": { "ego": 3, "anger": 4, "honor": 10, "loyalty": 8, "ambition": 5 },
    "emotionalState": { "confidence": 7, "frustration": 3, "fatigue": 4 },
    "relationships": [],
    "memories": [],
    "managerTrust": 8,
    "finisher": "Honor Lock"
  },
  {
    "wrestlerId": "w-003",
    "name": "Slick Vince",
    "gimmick": "The Cowardly Schemer",
    "stats": { "strength": 50, "agility": 85, "endurance": 55, "charisma": 80 },
    "personality": { "ego": 6, "anger": 3, "honor": 1, "loyalty": 2, "ambition": 7 },
    "emotionalState": { "confidence": 5, "frustration": 6, "fatigue": 3 },
    "relationships": [],
    "memories": [],
    "managerTrust": 3,
    "finisher": "Slick Sneak Attack"
  },
  {
    "wrestlerId": "w-004",
    "name": "Iron Maddox",
    "gimmick": "The Unfeeling Brawler",
    "stats": { "strength": 90, "agility": 40, "endurance": 85, "charisma": 40 },
    "personality": { "ego": 5, "anger": 9, "honor": 5, "loyalty": 6, "ambition": 4 },
    "emotionalState": { "confidence": 7, "frustration": 7, "fatigue": 5 },
    "relationships": [],
    "memories": [],
    "managerTrust": 5,
    "finisher": "Iron Smash"
  },
  {
    "wrestlerId": "w-005",
    "name": "Dazzle King",
    "gimmick": "The Showman",
    "stats": { "strength": 60, "agility": 80, "endurance": 65, "charisma": 95 },
    "personality": { "ego": 7, "anger": 3, "honor": 5, "loyalty": 5, "ambition": 6 },
    "emotionalState": { "confidence": 8, "frustration": 2, "fatigue": 4 },
    "relationships": [],
    "memories": [],
    "managerTrust": 6,
    "finisher": "Dazzler Finale"
  },
  {
    "wrestlerId": "w-006",
    "name": "Rookie Blaze",
    "gimmick": "The Hungry Newcomer",
    "stats": { "strength": 60, "agility": 70, "endurance": 70, "charisma": 55 },
    "personality": { "ego": 4, "anger": 5, "honor": 6, "loyalty": 7, "ambition": 10 },
    "emotionalState": { "confidence": 5, "frustration": 5, "fatigue": 6 },
    "relationships": [],
    "memories": [],
    "managerTrust": 7,
    "finisher": "Blaze Rush"
  }
]
```

- [ ] **Step 3: Update `Wrestler`-typed fixtures in all existing spec files**

Adding `finisher: string` as a required field to `Wrestler` will cause TypeScript errors in every spec file that constructs a `Wrestler` object. Update each of these files:

**`apps/wrastlin/meta-service/src/api/wrestlers.spec.ts`**
Add `finisher: 'Dominion Driver'` to `mockWrestler`.

**`apps/wrastlin/meta-service/src/storyteller/matchResolver.spec.ts`**
Add `finisher: 'Test Finisher'` to the default base object in `makeWrestler`:
```typescript
const makeWrestler = (overrides: Partial<Wrestler> = {}): Wrestler => ({
  wrestlerId: 'w-test-a',
  name: 'Test A',
  gimmick: 'Tester',
  stats: { strength: 70, agility: 70, endurance: 70, charisma: 70 },
  personality: { ego: 5, anger: 5, honor: 5, loyalty: 5, ambition: 5 },
  emotionalState: { confidence: 5, frustration: 5, fatigue: 5 },
  relationships: [],
  memories: [],
  managerTrust: 5,
  finisher: 'Test Finisher',  // ADD THIS
  ...overrides,
});
```

**`apps/wrastlin/meta-service/src/storyteller/showGenerator.spec.ts`**
Add `finisher: 'Test Finisher'` to any Wrestler fixtures in this file.

**`apps/wrastlin/meta-service/src/wrestlers/wrestlerState.spec.ts`**
Add `finisher: 'Test Finisher'` to any Wrestler fixtures in this file.

After updating, any future spec files that construct `Wrestler` objects must also include `finisher`.

If there are other spec files in `src/` that construct typed `Wrestler` objects not listed above,
the TypeScript compiler will report errors in the next step — fix them the same way.

- [ ] **Step 4: Run tests to confirm nothing broke**

```bash
pnpm nx test wrastlin-service
```

Expected: all existing tests pass.

- [ ] **Step 5: Commit**

```bash
git add libs/wrastlin/shared/src/types/wrestler.ts \
  apps/wrastlin/meta-service/data/static/wrestlers.json \
  apps/wrastlin/meta-service/src
git commit -m "feat(wrastlin): add finisher field to Wrestler type and static data"
```

---

### Task 2: Add Announcer type and static announcer data

**Files:**
- Create: `libs/wrastlin/shared/src/types/announcer.ts`
- Modify: `libs/wrastlin/shared/src/index.ts`
- Create: `apps/wrastlin/meta-service/data/static/announcers.json`

- [ ] **Step 1: Create `libs/wrastlin/shared/src/types/announcer.ts`**

```typescript
export interface Announcer {
  announcerId: string;
  name: string;
  role: 'play-by-play' | 'color';
  theme: string;        // one sentence describing voice/personality
  catchphrases: string[];
}
```

- [ ] **Step 2: Export from `libs/wrastlin/shared/src/index.ts`**

Add to the end of `index.ts`:

```typescript
export * from './types/announcer.js';
```

- [ ] **Step 3: Create `apps/wrastlin/meta-service/data/static/announcers.json`**

```json
[
  {
    "announcerId": "a-001",
    "name": "Brock Calloway",
    "role": "play-by-play",
    "theme": "Energetic Southern broadcaster who gets genuinely excited about athleticism and never shies from dramatic declarations",
    "catchphrases": [
      "Good God Almighty!",
      "As God as my witness, that man is broken in half!",
      "Business is about to pick up!"
    ]
  },
  {
    "announcerId": "a-002",
    "name": "Vinnie Vegas",
    "role": "color",
    "theme": "Smarmy heel-sympathetic commentator who always has an excuse for the villain and undermines babyface achievements",
    "catchphrases": [
      "That's just good strategy!",
      "Would you stop?!",
      "He's a genius, pure genius!"
    ]
  }
]
```

- [ ] **Step 4: Run tests to confirm the lib change compiles cleanly**

```bash
pnpm nx test wrastlin-service
```

Expected: all tests pass (the new export doesn't break anything).

- [ ] **Step 5: Commit**

```bash
git add libs/wrastlin/shared/src/types/announcer.ts \
  libs/wrastlin/shared/src/index.ts \
  apps/wrastlin/meta-service/data/static/announcers.json
git commit -m "feat(wrastlin): add Announcer type and static announcer data"
```

---

## Chunk 2: Agent types and prompt template files

### Task 3: Define agent input/output types

**Files:**
- Create: `apps/wrastlin/meta-service/src/agents/types.ts`

This file has no runtime behaviour — it's all TypeScript interfaces. No separate test file needed. Correctness is verified when the data builders and pipeline (later tasks) compile without errors.

Note: `PromoOutlineSegment` includes an optional `target?: string` field (a wrestlerId). This was identified as necessary during planning — the show outline agent needs to name the target explicitly so the data builder can look them up. The `show-outline.md` prompt template (Task 4) includes this field in its output schema.

- [ ] **Step 1: Create `apps/wrastlin/meta-service/src/agents/types.ts`**

```typescript
import type {
  WrestlerStats,
  WrestlerPersonality,
  WrestlerEmotions,
  Memory,
  Announcer,
} from '@org/wrastlin-shared';

// ── Show Outline (Agent 1 output) ────────────────────────────────────────────

export interface PromoOutlineSegment {
  segmentId: string;
  order: number;
  type: 'promo';
  participants: string[];   // wrestlerIds
  target?: string;          // wrestlerId this promo is directed at (absent = self-hype)
  goal: string;             // one sentence
}

export interface MatchOutlineSegment {
  segmentId: string;
  order: number;
  type: 'match';
  matchType: string;        // 'singles' | 'tag-team' | 'cage' | 'ladder' | ...
  participants: string[];   // wrestlerIds
  interference: string[];   // wrestlerIds who interfere (empty if none)
  headliner: boolean;
}

export type OutlineSegment = PromoOutlineSegment | MatchOutlineSegment;

export interface ShowOutline {
  showId: string;
  week: number;
  segments: OutlineSegment[];
}

// ── Match Beats (Agent 2 output) ─────────────────────────────────────────────

export type BeatType = 'action' | 'pause' | 'near-finish' | 'interference' | 'finish';

export interface MatchBeat {
  order: number;
  type: BeatType;
  actor: string | null;     // wrestlerId; null for pause beats
  description: string;
  durationMs: number;       // only meaningful on 'pause' beats; 0 otherwise
}

export interface MatchBeats {
  segmentId: string;
  beats: MatchBeat[];
  result: {
    winner: string;
    finishType: 'clean' | 'dirty' | 'interference' | 'count-out' | 'dq' | 'no-contest';
    crowdReaction: 'hot' | 'lukewarm' | 'dead';
  };
}

// ── Screenplays (Agents 3 and 4 output) ──────────────────────────────────────

export interface ScreenplayActor {
  name: string;
  role: string;
}

export interface PromoScreenplay {
  segmentId: string;
  actors: ScreenplayActor[];
  screenplay: string;   // raw text: "[NAME]: line\n[NAME]: line\n..."
}

export interface AnnouncerScreenplay {
  segmentId: string;
  actors: ScreenplayActor[];
  screenplay: string;   // raw text including [PAUSE: N] lines
}

// ── Pipeline output ───────────────────────────────────────────────────────────

export interface GeneratedMatchSegment extends MatchOutlineSegment {
  beats: MatchBeats;
  announcerScreenplay: AnnouncerScreenplay;
}

export interface GeneratedPromoSegment extends PromoOutlineSegment {
  promoScreenplay: PromoScreenplay;
}

export type GeneratedSegment = GeneratedMatchSegment | GeneratedPromoSegment;

export interface GeneratedShow {
  showOutline: ShowOutline;
  segments: GeneratedSegment[];
}

// ── Input payload types (what gets injected into prompt templates) ────────────

export interface WrestlerSummaryForOutline {
  wrestlerId: string;
  name: string;
  gimmick: string;
  emotionalState: WrestlerEmotions;
  rivalryHeat: Record<string, number>;  // { "w-002": 8, "w-003": 3, ... }
}

export interface SubmissionSummaryForOutline {
  managerId: string;
  wrestlerId: string;    // joined from Manager.wrestlerId
  advice: {
    matchStyle?: string;
    targetOpponent?: string;
  };
  storyRequests: Array<{
    type: string;
    target?: string;
    bribeAmount: number;
  }>;
}

export interface ShowOutlineInput {
  week: number;
  previousOutlines: ShowOutline[];
  wrestlers: WrestlerSummaryForOutline[];
  submissions: SubmissionSummaryForOutline[];
}

export interface WrestlerForMatchBeats {
  wrestlerId: string;
  name: string;
  gimmick: string;
  stats: WrestlerStats;
  personality: WrestlerPersonality;
  emotionalState: WrestlerEmotions;
  finisher: string;
  matchStyle?: string;   // from manager submission advice; absent if no submission
}

export interface MatchBeatsInput {
  segment: MatchOutlineSegment;
  wrestlers: WrestlerForMatchBeats[];
}

export interface ParticipantForPromo {
  wrestlerId: string;
  name: string;
  gimmick: string;
  personality: WrestlerPersonality;
  emotionalState: WrestlerEmotions;
  memories: Memory[];    // filtered to last 3 weeks (week >= currentWeek - 2)
}

export interface TargetForPromo {
  wrestlerId: string;
  name: string;
  gimmick: string;
  personality: WrestlerPersonality;
  sharedMemories: Memory[];   // memories where source or target matches any participant
}

export interface PromoScreenplayInput {
  segment: PromoOutlineSegment;
  participants: ParticipantForPromo[];
  target: TargetForPromo | null;
  personas: Announcer[];
}

export interface AnnouncerScreenplayInput {
  matchBeats: MatchBeats;
  announcers: Announcer[];
}

// ── Agent function interfaces ─────────────────────────────────────────────────

export type ShowOutlineAgentFn = (input: ShowOutlineInput) => Promise<ShowOutline>;
export type MatchBeatsAgentFn = (input: MatchBeatsInput) => Promise<MatchBeats>;
export type PromoScreenplayAgentFn = (input: PromoScreenplayInput) => Promise<PromoScreenplay>;
export type AnnouncerScreenplayAgentFn = (input: AnnouncerScreenplayInput) => Promise<AnnouncerScreenplay>;
```

- [ ] **Step 2: Verify the file compiles by running tests (even though no tests import it yet)**

```bash
pnpm nx test wrastlin-service
```

Expected: all tests still pass (no compilation errors in the new file).

- [ ] **Step 3: Commit**

```bash
git add apps/wrastlin/meta-service/src/agents/types.ts
git commit -m "feat(wrastlin): add agent input/output types for show generation pipeline"
```

---

### Task 4: Create prompt template files

**Files:**
- Create: `apps/wrastlin/meta-service/prompts/show-outline.md`
- Create: `apps/wrastlin/meta-service/prompts/match-beats.md`
- Create: `apps/wrastlin/meta-service/prompts/promo-screenplay.md`
- Create: `apps/wrastlin/meta-service/prompts/announcer-screenplay.md`

These are static text files. No tests needed.

- [ ] **Step 1: Create `apps/wrastlin/meta-service/prompts/show-outline.md`**

```markdown
## Role
You are an experienced wrestling booker responsible for creating the weekly show card.
Your job is to build a compelling show outline that maximizes crowd engagement,
honors manager requests, and advances ongoing storylines.

## Rules
- The last segment must always be the headliner — the biggest, most dramatic match of the night
- Never use the same match type for the headliner as the previous week's headliner
- Each show must have 3–5 segments total
- Every show must include at least 1 promo and at least 2 matches
- Any interference must name the specific wrestler involved — never use vague references
- Each promo must have exactly one goal: either hype the participant(s) OR target a specific rival
- If a promo targets a rival, include their wrestlerId in the "target" field; omit "target" for self-hype promos
- Weight manager story requests by bribeAmount — higher bribes have stronger influence
- If a manager's targetOpponent is specified, book that matchup when the story supports it

## Context

### Previous Show Outlines
Use these to avoid repeating the same match types, segment order, or headliner
matchups from recent weeks.

{{PREVIOUS_OUTLINES_JSON}}

### Wrestlers
rivalryHeat is pre-computed for each wrestler pair and is your primary booking
signal — high heat means the crowd wants to see these two fight. Emotional state
affects how reliable a wrestler is in a high-pressure spot.

{{WRESTLERS_JSON}}

### Manager Submissions
Story requests and advice submitted this week. Honor them weighted by bribeAmount.

{{SUBMISSIONS_JSON}}

## Output
Respond with only valid JSON matching the schema exactly. No prose, no explanation.

{
  "showId": "uuid",
  "week": {{WEEK}},
  "segments": [
    {
      "segmentId": "uuid",
      "order": 1,
      "type": "promo",
      "participants": ["wrestlerId"],
      "target": "wrestlerId (omit this field entirely for self-hype promos)",
      "goal": "one sentence — what this promo achieves"
    },
    {
      "segmentId": "uuid",
      "order": 2,
      "type": "match",
      "matchType": "singles | tag-team | cage | ladder | battle-royal | last-man-standing | ...",
      "participants": ["wrestlerId"],
      "interference": [],
      "headliner": false
    }
  ]
}
```

- [ ] **Step 2: Create `apps/wrastlin/meta-service/prompts/match-beats.md`**

```markdown
## Role
You are a wrestling match choreographer. Your job is to script the sequence of
beats for a single match — the moment-by-moment action that will be narrated
by the announcer. You follow the dramatic arc of professional wrestling while
making each match feel distinct.

## Rules
- Follow this arc: opening → control segment → hope spots → momentum reversal(s)
  → near-finishes → finish. Not every phase needs equal length — vary them.
- Vary which wrestler controls each phase. The winner does not need to dominate.
- Headliner matches (headliner: true) must have more beats and at least 2 near-finishes
- Mid-card matches should be tighter — 1 near-finish is enough
- Any wrestler listed in interference must appear in the beats at a dramatically
  appropriate moment (never in the opening phase)
- The finish type should reflect wrestler personality:
  high honor → prefer clean finish; high ego + low honor → prefer dirty or interference
- Pause beats are crowd moments — use them after near-finishes and the final finish
- Never end on a pause beat
- durationMs is only set on pause beats; use 0 for all other beat types

## Context

### Match Segment
This is the match you are scripting. matchType affects the kinds of moves available
(cage matches have escape attempts, ladder matches have climb spots, etc.).

{{SEGMENT_JSON}}

### Wrestlers
Stats determine capability — high agility enables high-flying moves, high strength
enables power moves. Personality shapes finish preference and desperation moments.
emotionalState affects reliability: low confidence wrestlers hesitate; high
frustration wrestlers take shortcuts. finisher is the wrestler's signature
finishing move. matchStyle (when present) is their manager's strategic advice.

{{WRESTLERS_JSON}}

## Output
Respond with only valid JSON matching the schema exactly. No prose, no explanation.

{
  "segmentId": "{{SEGMENT_ID}}",
  "beats": [
    {
      "order": 1,
      "type": "action | pause | near-finish | interference | finish",
      "actor": "wrestlerId or null for pause beats",
      "description": "one sentence describing what happens",
      "durationMs": 0
    }
  ],
  "result": {
    "winner": "wrestlerId",
    "finishType": "clean | dirty | interference | count-out | dq | no-contest",
    "crowdReaction": "hot | lukewarm | dead"
  }
}
```

- [ ] **Step 3: Create `apps/wrastlin/meta-service/prompts/promo-screenplay.md`**

```markdown
## Role
You are a wrestling promo writer. Your job is to write a short, punchy screenplay
for a single promo segment. Promos advance storylines and emotionally invest the
audience — they land on one or two memorable moments, not long speeches.

## Rules
- The promo must achieve the goal stated in the segment outline by the end
- Keep it tight: 3–6 exchanges total
- Wrestler personality drives tone:
  high ego → boastful and dismissive
  high anger → threatening, gets in people's faces
  high honor → principled, calls out disrespect directly
  high ambition → calculating, focused on what they want next
- If a rivalry memory exists between participants and a target, reference it
  specifically — vague trash talk is weak
- If an interviewer persona is included, they set up the wrestler and ask
  follow-up questions — they never overshadow the wrestler
- Wrestlers do not break character
- Do not have wrestlers summarize the plot — show personality, don't explain it

## Context

### Promo Segment
This defines who is in the promo and what it needs to accomplish.

{{SEGMENT_JSON}}

### Participants
The wrestlers delivering the promo. Personality and recent memories shape
what they would say and how they would say it.

{{PARTICIPANTS_JSON}}

### Target
The wrestler this promo is directed at, if any. Memories listed here are ones
involving both the target and the participants — use them for specific callbacks.

{{TARGET_JSON}}

### Personas
Non-wrestler characters available for this promo (interviewers, authority
figures, etc.).

{{PERSONAS_JSON}}

## Output
Write a screenplay in this format. This will be adapted for audio generation.

[ACTOR NAME]: Line of dialogue.
[ACTOR NAME]: Line of dialogue.

End with a blank line, then list the actors used:

ACTORS: Name (role), Name (role)
```

- [ ] **Step 4: Create `apps/wrastlin/meta-service/prompts/announcer-screenplay.md`**

```markdown
## Role
You are a broadcasting director scripting radio-style match commentary. Your job
is to turn match beats into a two-announcer screenplay — a play-by-play caller
who describes the action and a color commentator who adds personality and analysis.

## Rules
- Every action, near-finish, interference, and finish beat must be called by
  play-by-play — nothing happens silently
- Color commentary reacts to what play-by-play just said — it never just repeats it
- Pause beats become PAUSE lines with the beat's durationMs value
- Near-finishes get escalating excitement — each one should feel more desperate
  than the last
- The finish gets the biggest reaction from both announcers
- Catchphrases are used at most once per match, reserved for the most dramatic moment
- Do not editorialize about the outcome — announcers do not know who will win
  until the finish beat

## Context

### Match Beats
The ordered sequence of action to call. durationMs on pause beats tells you
how long the silence should last.

{{MATCH_BEATS_JSON}}

### Announcers
Each announcer has a role, a theme, and catchphrases. Use their voice consistently.

{{ANNOUNCERS_JSON}}

## Output
Write a screenplay in this format. This will be adapted for audio generation.

[ANNOUNCER NAME]: Line of dialogue.
[PAUSE: 800]
[ANNOUNCER NAME]: Line of dialogue.

End with a blank line, then list the actors used:

ACTORS: Name (role), Name (role)
```

- [ ] **Step 5: Commit**

```bash
git add apps/wrastlin/meta-service/prompts/
git commit -m "feat(wrastlin): add show generation prompt template files"
```

---

## Chunk 3: Prompt loader and data builders

### Task 5: Prompt loader

**Files:**
- Create: `apps/wrastlin/meta-service/src/agents/promptLoader.ts`
- Create: `apps/wrastlin/meta-service/src/agents/promptLoader.spec.ts`

- [ ] **Step 1: Write the failing tests**

Create `apps/wrastlin/meta-service/src/agents/promptLoader.spec.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { interpolate, loadPrompt } from './promptLoader.js';

describe('interpolate', () => {
  it('replaces a single placeholder', () => {
    expect(interpolate('Hello {{NAME}}', { NAME: 'World' })).toBe('Hello World');
  });

  it('replaces multiple placeholders', () => {
    const result = interpolate('{{A}} and {{B}}', { A: 'foo', B: 'bar' });
    expect(result).toBe('foo and bar');
  });

  it('replaces the same placeholder multiple times', () => {
    const result = interpolate('{{X}} then {{X}}', { X: '42' });
    expect(result).toBe('42 then 42');
  });

  it('leaves unknown placeholders intact', () => {
    const result = interpolate('{{KNOWN}} and {{UNKNOWN}}', { KNOWN: 'yes' });
    expect(result).toBe('yes and {{UNKNOWN}}');
  });

  it('returns the template unchanged when variables is empty', () => {
    expect(interpolate('no placeholders here', {})).toBe('no placeholders here');
  });
});

describe('loadPrompt', () => {
  let tmpDir: string;
  let originalEnv: string | undefined;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'prompts-'));
    originalEnv = process.env.PROMPTS_DIR;
    process.env.PROMPTS_DIR = tmpDir;
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true });
    if (originalEnv === undefined) {
      delete process.env.PROMPTS_DIR;
    } else {
      process.env.PROMPTS_DIR = originalEnv;
    }
  });

  it('reads a template file and interpolates placeholders', () => {
    fs.writeFileSync(path.join(tmpDir, 'test.md'), 'Hello {{NAME}}, week {{WEEK}}');
    const result = loadPrompt('test.md', { NAME: 'Rex', WEEK: '5' });
    expect(result).toBe('Hello Rex, week 5');
  });

  it('throws when the file does not exist', () => {
    expect(() => loadPrompt('missing.md', {})).toThrow();
  });
});
```

Note: `loadPrompt` uses `process.env.PROMPTS_DIR` as an override for the prompts directory.
This avoids any reliance on `import.meta.dirname` path resolution at test time — always set
`PROMPTS_DIR` in tests rather than depending on the resolved path. In production, `PROMPTS_DIR`
is set by the deployment environment; the `import.meta.dirname` fallback is for local `node dist/`
runs only.

- [ ] **Step 2: Run to confirm failure**

```bash
pnpm nx test wrastlin-service
```

Expected: FAIL — `Cannot find module './promptLoader.js'`

- [ ] **Step 3: Implement `apps/wrastlin/meta-service/src/agents/promptLoader.ts`**

```typescript
import fs from 'node:fs';
import path from 'node:path';

export function interpolate(
  template: string,
  variables: Record<string, string>,
): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key: string) => variables[key] ?? `{{${key}}}`);
}

export function loadPrompt(
  filename: string,
  variables: Record<string, string>,
): string {
  // Resolve dir inside the function so process.env.PROMPTS_DIR can be overridden
  // in tests after module load.
  const dir = process.env.PROMPTS_DIR
    ?? path.resolve(import.meta.dirname, '../../prompts');
  const template = fs.readFileSync(path.join(dir, filename), 'utf-8');
  return interpolate(template, variables);
}
```

- [ ] **Step 4: Run to confirm tests pass**

```bash
pnpm nx test wrastlin-service
```

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add apps/wrastlin/meta-service/src/agents/promptLoader.ts \
  apps/wrastlin/meta-service/src/agents/promptLoader.spec.ts
git commit -m "feat(wrastlin): add prompt loader with interpolation"
```

---

### Task 6: rivalryHeat computation

**Files:**
- Create: `apps/wrastlin/meta-service/src/agents/dataBuilders.ts`
- Create: `apps/wrastlin/meta-service/src/agents/dataBuilders.spec.ts`

Start with just `computeRivalryHeat`. More functions are added in Task 7.

- [ ] **Step 1: Write the failing tests**

Create `apps/wrastlin/meta-service/src/agents/dataBuilders.spec.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import type { Wrestler } from '@org/wrastlin-shared';
import { computeRivalryHeat } from './dataBuilders.js';

// Minimal fixture helper — only fields relevant to rivalry heat
function makeWrestler(id: string, relationships: Wrestler['relationships'] = []): Wrestler {
  return {
    wrestlerId: id,
    name: `Wrestler ${id}`,
    gimmick: 'Test Gimmick',
    stats: { strength: 70, agility: 70, endurance: 70, charisma: 70 },
    personality: { ego: 5, anger: 5, honor: 5, loyalty: 5, ambition: 5 },
    emotionalState: { confidence: 5, frustration: 5, fatigue: 5 },
    relationships,
    memories: [],
    managerTrust: 5,
    finisher: 'Test Finisher',
  };
}

describe('computeRivalryHeat', () => {
  it('returns 0 when neither wrestler has a relationship', () => {
    const wrestlers = [makeWrestler('w-001'), makeWrestler('w-002')];
    expect(computeRivalryHeat(wrestlers, 'w-001', 'w-002')).toBe(0);
  });

  it('returns the average of mutual hatred rounded to nearest integer', () => {
    const wrestlers = [
      makeWrestler('w-001', [{ wrestlerId: 'w-002', hatred: 8, respect: 2, trust: 1 }]),
      makeWrestler('w-002', [{ wrestlerId: 'w-001', hatred: 6, respect: 3, trust: 2 }]),
    ];
    expect(computeRivalryHeat(wrestlers, 'w-001', 'w-002')).toBe(7); // (8+6)/2 = 7
  });

  it('returns half of one-sided hatred when the other side has no relationship entry', () => {
    const wrestlers = [
      makeWrestler('w-001', [{ wrestlerId: 'w-002', hatred: 8, respect: 2, trust: 1 }]),
      makeWrestler('w-002', []),
    ];
    expect(computeRivalryHeat(wrestlers, 'w-001', 'w-002')).toBe(4); // (8+0)/2 = 4
  });

  it('rounds 0.5 up', () => {
    const wrestlers = [
      makeWrestler('w-001', [{ wrestlerId: 'w-002', hatred: 7, respect: 2, trust: 1 }]),
      makeWrestler('w-002', [{ wrestlerId: 'w-001', hatred: 8, respect: 3, trust: 2 }]),
    ];
    expect(computeRivalryHeat(wrestlers, 'w-001', 'w-002')).toBe(8); // (7+8)/2 = 7.5 → 8
  });
});
```

- [ ] **Step 2: Run to confirm failure**

```bash
pnpm nx test wrastlin-service
```

Expected: FAIL — `Cannot find module './dataBuilders.js'`

- [ ] **Step 3: Implement `computeRivalryHeat` in `apps/wrastlin/meta-service/src/agents/dataBuilders.ts`**

```typescript
import type {
  Wrestler,
  Manager,
  WeeklySubmission,
  Announcer,
} from '@org/wrastlin-shared';
import type {
  ShowOutline,
  ShowOutlineInput,
  WrestlerSummaryForOutline,
  SubmissionSummaryForOutline,
  MatchOutlineSegment,
  MatchBeatsInput,
  WrestlerForMatchBeats,
  PromoOutlineSegment,
  PromoScreenplayInput,
  ParticipantForPromo,
  TargetForPromo,
  AnnouncerScreenplayInput,
  MatchBeats,
} from './types.js';

export function computeRivalryHeat(
  wrestlers: Wrestler[],
  a: string,
  b: string,
): number {
  const aHatesB = wrestlers
    .find(w => w.wrestlerId === a)
    ?.relationships.find(r => r.wrestlerId === b)?.hatred ?? 0;
  const bHatesA = wrestlers
    .find(w => w.wrestlerId === b)
    ?.relationships.find(r => r.wrestlerId === a)?.hatred ?? 0;
  return Math.round((aHatesB + bHatesA) / 2);
}
```

- [ ] **Step 4: Run to confirm tests pass**

```bash
pnpm nx test wrastlin-service
```

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add apps/wrastlin/meta-service/src/agents/dataBuilders.ts \
  apps/wrastlin/meta-service/src/agents/dataBuilders.spec.ts
git commit -m "feat(wrastlin): add computeRivalryHeat to data builders"
```

---

### Task 7: Input payload builder functions

**Files:**
- Modify: `apps/wrastlin/meta-service/src/agents/dataBuilders.ts`
- Modify: `apps/wrastlin/meta-service/src/agents/dataBuilders.spec.ts`

- [ ] **Step 1: Write failing tests — add to `dataBuilders.spec.ts`**

Add these imports at the top of the spec file:

```typescript
import type { Manager, WeeklySubmission, Announcer } from '@org/wrastlin-shared';
import type { MatchOutlineSegment, PromoOutlineSegment, MatchBeats } from './types.js';
import {
  computeRivalryHeat,
  buildShowOutlineInput,
  buildMatchBeatsInput,
  buildPromoScreenplayInput,
  buildAnnouncerScreenplayInput,
} from './dataBuilders.js';
```

Add fixture helpers after `makeWrestler`:

```typescript
function makeManager(managerId: string, wrestlerId: string): Manager {
  return { managerId, wrestlerId, money: 1000, trustLevel: 'medium' };
}

function makeSubmission(managerId: string, week: number, overrides: Partial<WeeklySubmission> = {}): WeeklySubmission {
  return {
    submissionId: `sub-${managerId}`,
    managerId,
    week,
    advice: { matchStyle: 'technical' },
    storyRequests: [],
    submittedAt: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

const SAMPLE_MATCH_SEGMENT: MatchOutlineSegment = {
  segmentId: 's-001',
  order: 2,
  type: 'match',
  matchType: 'singles',
  participants: ['w-001', 'w-002'],
  interference: [],
  headliner: false,
};

const SAMPLE_PROMO_SEGMENT: PromoOutlineSegment = {
  segmentId: 's-002',
  order: 1,
  type: 'promo',
  participants: ['w-001'],
  target: 'w-002',
  goal: 'Rex trash-talks Steel Purity',
};

const SAMPLE_ANNOUNCERS: Announcer[] = [
  {
    announcerId: 'a-001',
    name: 'Brock Calloway',
    role: 'play-by-play',
    theme: 'Energetic Southern broadcaster',
    catchphrases: ['Good God Almighty!'],
  },
];
```

Add test suites:

```typescript
describe('buildShowOutlineInput', () => {
  it('includes a rivalryHeat map on each wrestler', () => {
    const wrestlers = [
      makeWrestler('w-001', [{ wrestlerId: 'w-002', hatred: 8, respect: 2, trust: 1 }]),
      makeWrestler('w-002', [{ wrestlerId: 'w-001', hatred: 6, respect: 3, trust: 2 }]),
    ];
    const result = buildShowOutlineInput(1, wrestlers, [], [], []);
    expect(result.wrestlers[0].rivalryHeat['w-002']).toBe(7);
    expect(result.wrestlers[1].rivalryHeat['w-001']).toBe(7);
  });

  it('joins wrestler ID onto submission via manager', () => {
    const wrestlers = [makeWrestler('w-001'), makeWrestler('w-002')];
    const managers = [makeManager('m-001', 'w-001')];
    const submissions = [makeSubmission('m-001', 1)];
    const result = buildShowOutlineInput(1, wrestlers, managers, submissions, []);
    expect(result.submissions[0].wrestlerId).toBe('w-001');
    expect(result.submissions[0].managerId).toBe('m-001');
  });

  it('omits submissions whose manager does not match any manager', () => {
    const wrestlers = [makeWrestler('w-001')];
    const managers = [makeManager('m-001', 'w-001')];
    const submissions = [makeSubmission('m-999', 1)];  // unknown manager
    const result = buildShowOutlineInput(1, wrestlers, managers, submissions, []);
    expect(result.submissions).toHaveLength(0);
  });
});

describe('buildMatchBeatsInput', () => {
  it('only includes wrestlers who are participants or interference', () => {
    const wrestlers = [
      makeWrestler('w-001'),
      makeWrestler('w-002'),
      makeWrestler('w-003'),  // not in this match
    ];
    const segment: MatchOutlineSegment = { ...SAMPLE_MATCH_SEGMENT, participants: ['w-001', 'w-002'], interference: [] };
    const result = buildMatchBeatsInput(segment, wrestlers, [], []);
    expect(result.wrestlers.map(w => w.wrestlerId)).toEqual(['w-001', 'w-002']);
  });

  it('includes interference wrestler in the payload', () => {
    const wrestlers = [makeWrestler('w-001'), makeWrestler('w-002'), makeWrestler('w-003')];
    const segment: MatchOutlineSegment = { ...SAMPLE_MATCH_SEGMENT, interference: ['w-003'] };
    const result = buildMatchBeatsInput(segment, wrestlers, [], []);
    expect(result.wrestlers.map(w => w.wrestlerId)).toContain('w-003');
  });

  it('merges matchStyle from manager submission when available', () => {
    const wrestlers = [makeWrestler('w-001'), makeWrestler('w-002')];
    const managers = [makeManager('m-001', 'w-001')];
    const submissions = [makeSubmission('m-001', 1, { advice: { matchStyle: 'heel' } })];
    const result = buildMatchBeatsInput(SAMPLE_MATCH_SEGMENT, wrestlers, managers, submissions);
    const w1 = result.wrestlers.find(w => w.wrestlerId === 'w-001')!;
    expect(w1.matchStyle).toBe('heel');
  });

  it('omits matchStyle when the wrestler has no manager submission', () => {
    const wrestlers = [makeWrestler('w-001'), makeWrestler('w-002')];
    const result = buildMatchBeatsInput(SAMPLE_MATCH_SEGMENT, wrestlers, [], []);
    const w1 = result.wrestlers.find(w => w.wrestlerId === 'w-001')!;
    expect(w1.matchStyle).toBeUndefined();
  });
});

describe('buildPromoScreenplayInput', () => {
  it('filters participant memories to the last 3 weeks', () => {
    const currentWeek = 5;
    const wrestlers = [
      makeWrestler('w-001'),
      makeWrestler('w-002'),
    ];
    // Give w-001 memories spanning weeks 1–5
    wrestlers[0].memories = [
      { memoryId: 'm1', type: 'victory', source: 'w-001', target: 'w-002', week: 1, intensity: 5 },
      { memoryId: 'm2', type: 'humiliation', source: 'w-003', target: 'w-001', week: 3, intensity: 7 },
      { memoryId: 'm3', type: 'betrayal', source: 'w-001', target: 'w-002', week: 5, intensity: 9 },
    ];
    const result = buildPromoScreenplayInput(SAMPLE_PROMO_SEGMENT, wrestlers, currentWeek, []);
    const participant = result.participants.find(p => p.wrestlerId === 'w-001')!;
    // Only weeks 3–5 (>= currentWeek - 2) should be included
    expect(participant.memories.map(m => m.week)).not.toContain(1);
    expect(participant.memories.map(m => m.week)).toContain(3);
    expect(participant.memories.map(m => m.week)).toContain(5);
  });

  it('returns target with shared memories when segment has a target', () => {
    const wrestlers = [
      makeWrestler('w-001'),
      makeWrestler('w-002'),
    ];
    wrestlers[1].memories = [
      { memoryId: 'm1', type: 'humiliation', source: 'w-001', target: 'w-002', week: 4, intensity: 8 },
      { memoryId: 'm2', type: 'victory', source: 'w-003', target: 'w-002', week: 4, intensity: 5 },
    ];
    const result = buildPromoScreenplayInput(SAMPLE_PROMO_SEGMENT, wrestlers, 5, []);
    expect(result.target).not.toBeNull();
    expect(result.target!.wrestlerId).toBe('w-002');
    // m1 involves participant w-001; m2 does not
    expect(result.target!.sharedMemories.map(m => m.memoryId)).toContain('m1');
    expect(result.target!.sharedMemories.map(m => m.memoryId)).not.toContain('m2');
  });

  it('returns null target for self-hype promos', () => {
    const promoNoTarget: PromoOutlineSegment = { ...SAMPLE_PROMO_SEGMENT, target: undefined };
    const wrestlers = [makeWrestler('w-001')];
    const result = buildPromoScreenplayInput(promoNoTarget, wrestlers, 5, []);
    expect(result.target).toBeNull();
  });
});

describe('buildAnnouncerScreenplayInput', () => {
  it('passes match beats and announcers through to the input', () => {
    const beats: MatchBeats = {
      segmentId: 's-001',
      beats: [
        { order: 1, type: 'action', actor: 'w-001', description: 'clothesline', durationMs: 0 },
        { order: 2, type: 'finish', actor: 'w-001', description: 'Dominion Driver', durationMs: 0 },
      ],
      result: { winner: 'w-001', finishType: 'clean', crowdReaction: 'hot' },
    };
    const result = buildAnnouncerScreenplayInput(beats, SAMPLE_ANNOUNCERS);
    expect(result.matchBeats.segmentId).toBe('s-001');
    expect(result.announcers).toHaveLength(1);
    expect(result.announcers[0].name).toBe('Brock Calloway');
  });
});
```

- [ ] **Step 2: Run to confirm failure**

```bash
pnpm nx test wrastlin-service
```

Expected: FAIL — `buildShowOutlineInput is not a function` (and others)

- [ ] **Step 3: Implement the payload builders in `dataBuilders.ts`**

Add after `computeRivalryHeat`:

```typescript
export function buildShowOutlineInput(
  week: number,
  wrestlers: Wrestler[],
  managers: Manager[],
  submissions: WeeklySubmission[],
  previousOutlines: ShowOutline[],
): ShowOutlineInput {
  const wrestlerSummaries: WrestlerSummaryForOutline[] = wrestlers.map(w => {
    const rivalryHeat: Record<string, number> = {};
    for (const other of wrestlers) {
      if (other.wrestlerId !== w.wrestlerId) {
        rivalryHeat[other.wrestlerId] = computeRivalryHeat(wrestlers, w.wrestlerId, other.wrestlerId);
      }
    }
    return {
      wrestlerId: w.wrestlerId,
      name: w.name,
      gimmick: w.gimmick,
      emotionalState: w.emotionalState,
      rivalryHeat,
    };
  });

  const submissionSummaries: SubmissionSummaryForOutline[] = submissions
    .map(sub => {
      const manager = managers.find(m => m.managerId === sub.managerId);
      if (!manager) return null;
      return {
        managerId: sub.managerId,
        wrestlerId: manager.wrestlerId,
        advice: {
          matchStyle: sub.advice.matchStyle,
          targetOpponent: sub.advice.targetOpponent,
        },
        storyRequests: sub.storyRequests.map(sr => ({
          type: sr.type,
          target: sr.target,
          bribeAmount: sr.bribeAmount,
        })),
      };
    })
    .filter((s): s is SubmissionSummaryForOutline => s !== null);

  return { week, previousOutlines, wrestlers: wrestlerSummaries, submissions: submissionSummaries };
}

export function buildMatchBeatsInput(
  segment: MatchOutlineSegment,
  allWrestlers: Wrestler[],
  allManagers: Manager[],
  submissions: WeeklySubmission[],
): MatchBeatsInput {
  const relevantIds = new Set([...segment.participants, ...segment.interference]);
  const wrestlers: WrestlerForMatchBeats[] = allWrestlers
    .filter(w => relevantIds.has(w.wrestlerId))
    .map(w => {
      const manager = allManagers.find(m => m.wrestlerId === w.wrestlerId);
      const submission = manager
        ? submissions.find(s => s.managerId === manager.managerId)
        : undefined;
      const entry: WrestlerForMatchBeats = {
        wrestlerId: w.wrestlerId,
        name: w.name,
        gimmick: w.gimmick,
        stats: w.stats,
        personality: w.personality,
        emotionalState: w.emotionalState,
        finisher: w.finisher,
      };
      if (submission?.advice.matchStyle) {
        entry.matchStyle = submission.advice.matchStyle;
      }
      return entry;
    });
  return { segment, wrestlers };
}

export function buildPromoScreenplayInput(
  segment: PromoOutlineSegment,
  allWrestlers: Wrestler[],
  currentWeek: number,
  personas: Announcer[],
): PromoScreenplayInput {
  const minWeek = currentWeek - 2;

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
        memories: w.memories.filter(m => m.week >= minWeek),
      };
    })
    .filter((p): p is ParticipantForPromo => p !== null);

  let target: TargetForPromo | null = null;
  if (segment.target) {
    const targetWrestler = allWrestlers.find(w => w.wrestlerId === segment.target);
    if (targetWrestler) {
      const participantIds = new Set(segment.participants);
      const sharedMemories = targetWrestler.memories.filter(
        m => participantIds.has(m.source) || participantIds.has(m.target),
      );
      target = {
        wrestlerId: targetWrestler.wrestlerId,
        name: targetWrestler.name,
        gimmick: targetWrestler.gimmick,
        personality: targetWrestler.personality,
        sharedMemories,
      };
    }
  }

  return { segment, participants, target, personas };
}

export function buildAnnouncerScreenplayInput(
  matchBeats: MatchBeats,
  announcers: Announcer[],
): AnnouncerScreenplayInput {
  return { matchBeats, announcers };
}
```

- [ ] **Step 4: Run to confirm all tests pass**

```bash
pnpm nx test wrastlin-service
```

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add apps/wrastlin/meta-service/src/agents/dataBuilders.ts \
  apps/wrastlin/meta-service/src/agents/dataBuilders.spec.ts
git commit -m "feat(wrastlin): add show generation input payload builders"
```

---

## Chunk 4: Stub agents and pipeline

### Task 8: Stub agent implementations

**Files:**
- Create: `apps/wrastlin/meta-service/src/agents/stubs/stubShowOutlineAgent.ts`
- Create: `apps/wrastlin/meta-service/src/agents/stubs/stubMatchBeatsAgent.ts`
- Create: `apps/wrastlin/meta-service/src/agents/stubs/stubPromoScreenplayAgent.ts`
- Create: `apps/wrastlin/meta-service/src/agents/stubs/stubAnnouncerScreenplayAgent.ts`

Stubs are deterministic functions that return fixture data. They match the agent function interfaces. No tests for the stubs themselves — they're validated by the pipeline integration test in Task 9.

- [ ] **Step 1: Create `stubs/stubShowOutlineAgent.ts`**

```typescript
import type { ShowOutlineAgentFn, ShowOutline } from '../types.js';

export const stubShowOutlineAgent: ShowOutlineAgentFn = async (input): Promise<ShowOutline> => {
  return {
    showId: 'stub-show-001',
    week: input.week,
    segments: [
      {
        segmentId: 'stub-seg-001',
        order: 1,
        type: 'promo',
        participants: ['w-001'],
        target: 'w-002',
        goal: 'Rex trash-talks Steel Purity to build heat',
      },
      {
        segmentId: 'stub-seg-002',
        order: 2,
        type: 'match',
        matchType: 'singles',
        participants: ['w-003', 'w-004'],
        interference: [],
        headliner: false,
      },
      {
        segmentId: 'stub-seg-003',
        order: 3,
        type: 'match',
        matchType: 'cage',
        participants: ['w-001', 'w-002'],
        interference: [],
        headliner: true,
      },
    ],
  };
};
```

- [ ] **Step 2: Create `stubs/stubMatchBeatsAgent.ts`**

```typescript
import type { MatchBeatsAgentFn, MatchBeats } from '../types.js';

export const stubMatchBeatsAgent: MatchBeatsAgentFn = async (input): Promise<MatchBeats> => {
  const [p1, p2] = input.segment.participants;
  return {
    segmentId: input.segment.segmentId,
    beats: [
      { order: 1, type: 'action', actor: p1, description: `${p1} opens with a running attack`, durationMs: 0 },
      { order: 2, type: 'action', actor: p2, description: `${p2} fires back with a suplex`, durationMs: 0 },
      { order: 3, type: 'near-finish', actor: p1, description: `${p1} covers — two count`, durationMs: 0 },
      { order: 4, type: 'pause', actor: null, description: 'crowd pops', durationMs: 1500 },
      { order: 5, type: 'finish', actor: p1, description: `${p1} hits the finisher for the win`, durationMs: 0 },
    ],
    result: {
      winner: p1,
      finishType: 'clean',
      crowdReaction: 'hot',
    },
  };
};
```

- [ ] **Step 3: Create `stubs/stubPromoScreenplayAgent.ts`**

```typescript
import type { PromoScreenplayAgentFn, PromoScreenplay } from '../types.js';

export const stubPromoScreenplayAgent: PromoScreenplayAgentFn = async (input): Promise<PromoScreenplay> => {
  const participantName = input.participants[0]?.name ?? 'Unknown';
  const targetName = input.target?.name ?? null;
  const line = targetName
    ? `You think you can beat me, ${targetName}? Not a chance.`
    : `Nobody in this company is on my level.`;
  return {
    segmentId: input.segment.segmentId,
    actors: [{ name: participantName, role: 'wrestler' }],
    screenplay: `[${participantName.toUpperCase()}]: ${line}\n\nACTORS: ${participantName} (wrestler)`,
  };
};
```

- [ ] **Step 4: Create `stubs/stubAnnouncerScreenplayAgent.ts`**

```typescript
import type { AnnouncerScreenplayAgentFn, AnnouncerScreenplay } from '../types.js';

export const stubAnnouncerScreenplayAgent: AnnouncerScreenplayAgentFn = async (input): Promise<AnnouncerScreenplay> => {
  const playByPlay = input.announcers.find(a => a.role === 'play-by-play');
  const color = input.announcers.find(a => a.role === 'color');
  const ppName = playByPlay?.name ?? 'Announcer';
  const colorName = color?.name ?? 'Color';
  const lines = input.matchBeats.beats
    .map(b => {
      if (b.type === 'pause') return `[PAUSE: ${b.durationMs}]`;
      return `[${ppName.toUpperCase()}]: ${b.description}`;
    })
    .join('\n');
  const actorList = [playByPlay, color]
    .filter(Boolean)
    .map(a => `${a!.name} (${a!.role})`)
    .join(', ');
  return {
    segmentId: input.matchBeats.segmentId,
    actors: [
      { name: ppName, role: 'play-by-play' },
      ...(color ? [{ name: colorName, role: 'color' }] : []),
    ],
    screenplay: `${lines}\n\nACTORS: ${actorList}`,
  };
};
```

- [ ] **Step 5: Run tests to confirm no breakage**

```bash
pnpm nx test wrastlin-service
```

Expected: all tests pass.

- [ ] **Step 6: Commit**

```bash
git add apps/wrastlin/meta-service/src/agents/stubs/
git commit -m "feat(wrastlin): add stub agent implementations for pipeline testing"
```

---

### Task 9: Pipeline orchestrator and integration test

**Files:**
- Create: `apps/wrastlin/meta-service/src/agents/pipeline.ts`
- Create: `apps/wrastlin/meta-service/src/agents/pipeline.spec.ts`

- [ ] **Step 1: Write the failing integration test**

Create `apps/wrastlin/meta-service/src/agents/pipeline.spec.ts`:

```typescript
import { describe, it, expect, vi } from 'vitest';
import type { Wrestler, Manager, Announcer } from '@org/wrastlin-shared';
import type { GeneratedMatchSegment, GeneratedPromoSegment } from './types.js';
import { runShowPipeline } from './pipeline.js';
import { stubShowOutlineAgent } from './stubs/stubShowOutlineAgent.js';
import { stubMatchBeatsAgent } from './stubs/stubMatchBeatsAgent.js';
import { stubPromoScreenplayAgent } from './stubs/stubPromoScreenplayAgent.js';
import { stubAnnouncerScreenplayAgent } from './stubs/stubAnnouncerScreenplayAgent.js';
import { buildShowOutlineInput } from './dataBuilders.js';

const STUB_AGENTS = {
  showOutline: stubShowOutlineAgent,
  matchBeats: stubMatchBeatsAgent,
  promoScreenplay: stubPromoScreenplayAgent,
  announcerScreenplay: stubAnnouncerScreenplayAgent,
};

function makeWrestler(id: string): Wrestler {
  return {
    wrestlerId: id,
    name: `Wrestler ${id}`,
    gimmick: 'Test',
    stats: { strength: 70, agility: 70, endurance: 70, charisma: 70 },
    personality: { ego: 5, anger: 5, honor: 5, loyalty: 5, ambition: 5 },
    emotionalState: { confidence: 5, frustration: 5, fatigue: 5 },
    relationships: [],
    memories: [],
    managerTrust: 5,
    finisher: 'Test Finisher',
  };
}

const WRESTLERS = ['w-001', 'w-002', 'w-003', 'w-004'].map(makeWrestler);
const MANAGERS: Manager[] = [];
const ANNOUNCERS: Announcer[] = [
  {
    announcerId: 'a-001',
    name: 'Brock Calloway',
    role: 'play-by-play',
    theme: 'Energetic',
    catchphrases: [],
  },
];

describe('runShowPipeline', () => {
  it('calls the show outline agent once and returns a GeneratedShow', async () => {
    const outlineSpy = vi.fn(stubShowOutlineAgent);
    const result = await runShowPipeline({
      showOutlineInput: buildShowOutlineInput(1, WRESTLERS, MANAGERS, [], []),
      wrestlers: WRESTLERS,
      managers: MANAGERS,
      submissions: [],
      announcers: ANNOUNCERS,
      agents: { ...STUB_AGENTS, showOutline: outlineSpy },
    });
    expect(outlineSpy).toHaveBeenCalledTimes(1);
    expect(result.showOutline.week).toBe(1);
  });

  it('calls match beats agent once per match segment', async () => {
    const beatsSpy = vi.fn(stubMatchBeatsAgent);
    await runShowPipeline({
      showOutlineInput: buildShowOutlineInput(1, WRESTLERS, MANAGERS, [], []),
      wrestlers: WRESTLERS,
      managers: MANAGERS,
      submissions: [],
      announcers: ANNOUNCERS,
      agents: { ...STUB_AGENTS, matchBeats: beatsSpy },
    });
    // stub outline has 2 match segments
    expect(beatsSpy).toHaveBeenCalledTimes(2);
  });

  it('calls promo screenplay agent once per promo segment', async () => {
    const promoSpy = vi.fn(stubPromoScreenplayAgent);
    await runShowPipeline({
      showOutlineInput: buildShowOutlineInput(1, WRESTLERS, MANAGERS, [], []),
      wrestlers: WRESTLERS,
      managers: MANAGERS,
      submissions: [],
      announcers: ANNOUNCERS,
      agents: { ...STUB_AGENTS, promoScreenplay: promoSpy },
    });
    // stub outline has 1 promo segment
    expect(promoSpy).toHaveBeenCalledTimes(1);
  });

  it('calls announcer screenplay agent once per match segment (after beats)', async () => {
    const announcerSpy = vi.fn(stubAnnouncerScreenplayAgent);
    await runShowPipeline({
      showOutlineInput: buildShowOutlineInput(1, WRESTLERS, MANAGERS, [], []),
      wrestlers: WRESTLERS,
      managers: MANAGERS,
      submissions: [],
      announcers: ANNOUNCERS,
      agents: { ...STUB_AGENTS, announcerScreenplay: announcerSpy },
    });
    expect(announcerSpy).toHaveBeenCalledTimes(2);
  });

  it('generated match segments have beats and announcer screenplay', async () => {
    const result = await runShowPipeline({
      showOutlineInput: buildShowOutlineInput(1, WRESTLERS, MANAGERS, [], []),
      wrestlers: WRESTLERS,
      managers: MANAGERS,
      submissions: [],
      announcers: ANNOUNCERS,
      agents: STUB_AGENTS,
    });
    const matchSegments = result.segments.filter(
      (s): s is GeneratedMatchSegment => s.type === 'match',
    );
    expect(matchSegments).toHaveLength(2);
    for (const seg of matchSegments) {
      expect(seg.beats).toBeDefined();
      expect(seg.announcerScreenplay).toBeDefined();
    }
  });

  it('generated promo segments have a promo screenplay', async () => {
    const result = await runShowPipeline({
      showOutlineInput: buildShowOutlineInput(1, WRESTLERS, MANAGERS, [], []),
      wrestlers: WRESTLERS,
      managers: MANAGERS,
      submissions: [],
      announcers: ANNOUNCERS,
      agents: STUB_AGENTS,
    });
    const promoSegments = result.segments.filter(
      (s): s is GeneratedPromoSegment => s.type === 'promo',
    );
    expect(promoSegments).toHaveLength(1);
    expect(promoSegments[0].promoScreenplay).toBeDefined();
  });

  it('segments are ordered by the outline order field', async () => {
    const result = await runShowPipeline({
      showOutlineInput: buildShowOutlineInput(1, WRESTLERS, MANAGERS, [], []),
      wrestlers: WRESTLERS,
      managers: MANAGERS,
      submissions: [],
      announcers: ANNOUNCERS,
      agents: STUB_AGENTS,
    });
    const orders = result.segments.map(s => s.order);
    expect(orders).toEqual([...orders].sort((a, b) => a - b));
  });
});
```

- [ ] **Step 2: Run to confirm failure**

```bash
pnpm nx test wrastlin-service
```

Expected: FAIL — `Cannot find module './pipeline.js'`

- [ ] **Step 3: Implement `apps/wrastlin/meta-service/src/agents/pipeline.ts`**

```typescript
import type { Wrestler, Manager, WeeklySubmission, Announcer } from '@org/wrastlin-shared';
import type {
  ShowOutlineInput,
  ShowOutlineAgentFn,
  MatchBeatsAgentFn,
  PromoScreenplayAgentFn,
  AnnouncerScreenplayAgentFn,
  GeneratedShow,
  GeneratedMatchSegment,
  GeneratedPromoSegment,
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

  // Step 1: Generate show outline
  const showOutline = await agents.showOutline(showOutlineInput);

  // Step 2: Process all segments in parallel
  //   - matches → get beats
  //   - promos  → get screenplay
  const segmentResults: SegmentResult[] = await Promise.all(
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

  // Step 3: Run announcer screenplays for all match segments in parallel
  const generatedSegments: GeneratedSegment[] = await Promise.all(
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

  // Sort by order field to match the show card
  generatedSegments.sort((a, b) => a.order - b.order);

  return { showOutline, segments: generatedSegments };
}
```

- [ ] **Step 4: Run to confirm all tests pass**

```bash
pnpm nx test wrastlin-service
```

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add apps/wrastlin/meta-service/src/agents/pipeline.ts \
  apps/wrastlin/meta-service/src/agents/pipeline.spec.ts
git commit -m "feat(wrastlin): add show generation pipeline orchestrator with integration test"
```

---

## Final Verification

- [ ] Run the full test suite one more time

```bash
pnpm nx test wrastlin-service
```

Expected: all tests pass with no failures.
