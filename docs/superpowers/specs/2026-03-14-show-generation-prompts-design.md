# Show Generation Agent Prompts Design

**Date:** 2026-03-14
**Status:** Approved

---

## Overview

A 4-agent pipeline that generates a weekly wrestling show from manager submissions. Each agent is a prompt template file that takes structured inputs and produces structured outputs. Agents 2 and 3 run in parallel (one per segment), Agent 4 runs after Agent 2.

```
submissions closed
       │
       ▼
[Agent 1: Show Outline]
       │
       ├──────────────────────┐
       ▼                      ▼
[Agent 2: Match Beats]  [Agent 3: Promo Screenplay]
  (per match segment)   (per promo segment)
       │
       ▼
[Agent 4: Announcer Screenplay]
  (per match segment)
       │
       ▼
  world state update (deterministic, no AI)
```

---

## Prompt File Location

All prompt templates live in `apps/wrastlin/meta-service/prompts/`:

| File | Agent |
|------|-------|
| `show-outline.md` | Agent 1: Show Outline |
| `match-beats.md` | Agent 2: Match Beats |
| `promo-screenplay.md` | Agent 3: Promo Screenplay |
| `announcer-screenplay.md` | Agent 4: Announcer Screenplay |

---

## Template Structure

Every prompt file follows the same four-part structure:

```
## Role
Who this agent is and what it is responsible for.

## Rules
Explicit constraints that must always be followed.
New rules are added here as they are discovered in testing.

## Context
Each input introduced separately with a note on why it matters.
Data injected via {{PLACEHOLDER}} tokens.

## Output
Exact format instructions and the output schema.
```

The TypeScript caller loads the file, replaces all `{{PLACEHOLDER}}` tokens with serialized data, and sends the result as the user message. No separate system prompt — everything is in the single template file.

---

## Terminology

A **segment** is any unit of a show — either a match or a promo. This aligns with the existing `Segment` type in `@org/wrastlin-shared` and the pipeline described in `apps/wrastlin/docs/04_show_generation.md`.

| Term | Meaning |
|------|---------|
| segment | One unit of a show (match or promo) |
| show outline | The ordered list of segments produced by Agent 1 |
| match beats | The moment-by-moment action sequence produced by Agent 2 |
| screenplay | Human-readable dialogue output from Agent 3 or Agent 4 |

---

## Type Notes

### OutlineSegment vs Segment

The existing `Segment` type in `@org/wrastlin-shared` uses a closed union for `type`:
`'opening-promo' | 'singles-match' | 'backstage-confrontation' | 'interview' | 'betrayal' | 'title-match' | 'main-event'`

Agent 1 produces a different shape — `OutlineSegment` — which uses a simpler `type: 'promo' | 'match'` with an explicit `matchType` field for match variety. `OutlineSegment` is a planning type; the existing `Segment` is the resolved, post-production type. They are separate. The pipeline transforms `OutlineSegment[]` into `Segment[]` during world state update (Step 8, deterministic, not AI).

`OutlineSegment` includes an `order` field (1-based position in the show) that does not exist on the current `Segment` type.

### rivalryHeat

`rivalryHeat` is a pre-computed booking signal — not stored, computed at pipeline entry from wrestler relationships. The `Wrestler.relationships` field is an array of `{ wrestlerId: string; respect: number; hatred: number; trust: number }`. The computation:

```typescript
function rivalryHeat(wrestlers: Wrestler[], a: string, b: string): number {
  const aHatesB = wrestlers.find(w => w.wrestlerId === a)
    ?.relationships.find(r => r.wrestlerId === b)?.hatred ?? 0;
  const bHatesA = wrestlers.find(w => w.wrestlerId === b)
    ?.relationships.find(r => r.wrestlerId === a)?.hatred ?? 0;
  return Math.round((aHatesB + bHatesA) / 2);
}
```

Each wrestler in `{{WRESTLERS_JSON}}` receives a pre-computed `rivalryHeat` map keyed by other wrestler IDs, e.g. `{ "w-002": 8, "w-003": 3 }`.

A standalone `Rivalry` entity (with `phase`, `history`, `paidOff`) is deferred until feud phase tracking is needed.

### finisher field

`Wrestler` does not currently have a `finisher` field. This field needs to be added to the `Wrestler` type in `@org/wrastlin-shared` (a string, e.g. `"Dominion Driver"`). Agent 2 requires it. This is a prerequisite for implementing Agent 2.

### matchStyle in wrestler payload

`matchStyle` (`'technical' | 'brawl' | 'high-fly' | 'heel' | 'face'`) lives on `ManagerAdvice` in `WeeklySubmission`, not on `Wrestler`. When building Agent 2's wrestler payload, the caller looks up the wrestler's manager submission for the current week and merges `advice.matchStyle` into the wrestler object as `matchStyle`. If no submission exists for that wrestler's manager, `matchStyle` is omitted.

### Announcer type

Announcer personas are not yet in the data model. Define a minimal `Announcer` type for Agent 4:

```typescript
interface Announcer {
  announcerId: string;
  name: string;
  role: 'play-by-play' | 'color';
  theme: string;        // one sentence describing voice/personality
  catchphrases: string[];
}
```

Announcer data is stored as static JSON at `apps/wrastlin/meta-service/data/static/announcers.json`. No runtime mutations — announcers don't change week to week.

### Note on JSON schema doc

`apps/wrastlin/docs/08_json_schemas.md` is stale in several places (uses `targetId` instead of `wrestlerId` on relationships, uses `bribe` instead of `bribeAmount` on story requests, uses `crowdReaction: 0` instead of `'hot' | 'lukewarm' | 'dead'`). The authoritative source for field names is the TypeScript types in `@org/wrastlin-shared`.

---

## Agent 1: Show Outline

**Purpose:** Build the weekly show card from wrestler state and manager submissions.

**Input placeholders:**

| Placeholder | Contents |
|---|---|
| `{{WEEK}}` | Current week number (integer) |
| `{{PREVIOUS_OUTLINES_JSON}}` | Array of last 2 `ShowOutline` objects (segments only, no beats) |
| `{{WRESTLERS_JSON}}` | All wrestlers: `wrestlerId`, `name`, `gimmick`, `emotionalState`, `rivalryHeat` (pre-computed map) |
| `{{SUBMISSIONS_JSON}}` | All `WeeklySubmission` objects pre-filtered to the current week: `managerId`, `wrestlerId` (joined from `Manager.wrestlerId` where `Manager.managerId === submission.managerId`), `advice` (`matchStyle`, `targetOpponent`), `storyRequests` (`type`, `target`, `bribeAmount`) |

**Output format:** Strict JSON.

**Output schema:**
```json
{
  "showId": "uuid",
  "week": 3,
  "segments": [
    {
      "segmentId": "uuid",
      "order": 1,
      "type": "promo",
      "participants": ["w-001"],
      "goal": "one sentence describing what this promo achieves"
    },
    {
      "segmentId": "uuid",
      "order": 2,
      "type": "match",
      "matchType": "singles | tag-team | cage | ladder | battle-royal | last-man-standing | ...",
      "participants": ["w-001", "w-002"],
      "interference": [],
      "headliner": false
    }
  ]
}
```

**Prompt template (`show-outline.md`):**

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
      "goal": "one sentence — what this promo achieves"
    },
    {
      "segmentId": "uuid",
      "order": 2,
      "type": "match",
      "matchType": "singles | tag-team | cage | ladder | battle-royal | ...",
      "participants": ["wrestlerId"],
      "interference": [],
      "headliner": false
    }
  ]
}
```

---

## Agent 2: Match Beats

**Purpose:** Script the moment-by-moment action for a single match segment.

**Runs:** Once per match segment, in parallel with Agent 3.

**Prerequisites:** `Wrestler.finisher` field must be added to `@org/wrastlin-shared` before this agent can be called.

**Input placeholders:**

| Placeholder | Contents |
|---|---|
| `{{SEGMENT_ID}}` | The segmentId from the show outline (used in output) |
| `{{SEGMENT_JSON}}` | The single match segment: `matchType`, `participants`, `interference`, `headliner` |
| `{{WRESTLERS_JSON}}` | Participants + interference wrestlers: `wrestlerId`, `name`, `gimmick`, `stats`, `personality`, `emotionalState`, `finisher`, `matchStyle` (merged from manager submission if available) |

**Output format:** Strict JSON.

**Beat types:**
- `action` — a move, spot, or significant moment. `actor` is the performing wrestler.
- `pause` — a crowd reaction beat. `actor` is `null`. `durationMs` is required.
- `near-finish` — a cover or submission attempt that fails. `actor` is the attacker.
- `interference` — an outside wrestler enters. `actor` is the interfering wrestler.
- `finish` — the match-ending move. `actor` is the winner. Always the last beat.

`durationMs` is only meaningful on `pause` beats. Set to `0` on all other beat types.

**Output schema:**
```json
{
  "segmentId": "uuid",
  "beats": [
    {
      "order": 1,
      "type": "action | pause | near-finish | interference | finish",
      "actor": "wrestlerId or null",
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

**Prompt template (`match-beats.md`):**

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

---

## Agent 3: Promo Screenplay

**Purpose:** Write a short screenplay for a single promo segment.

**Runs:** Once per promo segment, in parallel with Agent 2.

**Input placeholders:**

| Placeholder | Contents |
|---|---|
| `{{SEGMENT_JSON}}` | The promo segment: `participants`, `goal` |
| `{{PARTICIPANTS_JSON}}` | Wrestler profiles: `wrestlerId`, `name`, `gimmick`, `personality`, `emotionalState`, `memories` (filtered to last 3 weeks — all memories in that window, regardless of who is involved) |
| `{{TARGET_JSON}}` | Target wrestler profile + that wrestler's memories where `source` or `target` matches any participant, or `null` if promo is self-hype. Relationship-filtered rather than time-filtered because only rivalry-relevant history matters for the target. |
| `{{PERSONAS_JSON}}` | Available non-wrestler personas (`Announcer`-shaped objects with `name`, `role`, `theme`), or `[]` |

**Output format:** Human-readable screenplay. Exact format TBD pending audio generation tool selection.

**Interim output format:**
```
[ACTOR NAME]: Line of dialogue.
[ACTOR NAME]: Line of dialogue.

ACTORS: Name (role), Name (role)
```

**Prompt template (`promo-screenplay.md`):**

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

---

## Agent 4: Announcer Screenplay

**Purpose:** Turn match beats into radio-style commentary.

**Runs:** Once per match segment, after Agent 2 completes.

**Input placeholders:**

| Placeholder | Contents |
|---|---|
| `{{MATCH_BEATS_JSON}}` | Full `MatchBeats` output from Agent 2 — ordered beats + result |
| `{{ANNOUNCERS_JSON}}` | Array of `Announcer` objects loaded from `data/static/announcers.json`: `announcerId`, `name`, `role`, `theme`, `catchphrases` |

**Output format:** Human-readable screenplay. Exact format TBD pending audio generation tool selection.

**Interim output format:**
```
[ANNOUNCER NAME]: Line of dialogue.
[PAUSE: 800]
[ANNOUNCER NAME]: Line of dialogue.

ACTORS: Name (role), Name (role)
```

**Prompt template (`announcer-screenplay.md`):**

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

---

## Testing Without AI

Each agent is a function `(input) → output`. Testing strategy:

1. **Fixture stubs** — Write stub agents that ignore input and return hardcoded fixture JSON matching each output schema. Wire the full pipeline using stubs to verify data flows correctly end-to-end.

2. **Schema validation at boundaries** — Add runtime validation on every agent's input and output. Catches mismatches immediately when swapping in real AI agents.

3. **`showGenerator.ts` as Agent 1 stub** — The current deterministic show generator can serve as a stub while building the AI version. Note: its output uses the old `SegmentType` union (`'opening-promo'`, `'singles-match'`, etc.) and will require transformation into `OutlineSegment` format (`type: 'promo' | 'match'`, `matchType`, `goal`, `headliner`, `order`).

4. **World state update tests** — The post-pipeline state update (relationships, memories, money) is deterministic. Unit test it independently using fixture `MatchBeats` results.

---

## Deferred

- Standalone `Rivalry` entity with `phase`, `history`, `paidOff` — deferred until feud phase tracking is needed
- Final screenplay output format for Agents 3 and 4 — locked down once audio generation tool is selected
- Auto-generation of betting propositions from show outline
- Auto-resolution of bets after match beats are produced
