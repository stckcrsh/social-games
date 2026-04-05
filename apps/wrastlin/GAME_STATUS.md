# Wrastlin — Game Loop Status

This document tracks what's built, what's stubbed, and what's missing for each step of the weekly game loop.

---

## The Weekly Loop

```
submissions open → admin closes → generate show → live event + betting → close betting → judge + payouts → advance week → repeat
```

---

## Step 1: Submission Phase

**Status: Built**

Managers submit their weekly instructions: match style preference, story requests, bribe amount, and an optional message to their wrestler.

**What exists:**
- `POST /submissions` — accepts managerId, advice (matchStyle, targetOpponent), storyRequests (type, target, bribeAmount), wrestlerMessage
- Frontend form with all fields
- One submission per manager per week (duplicate prevention)
- `GET /submissions/week/:week` to retrieve

**Admin action:** `pnpm nx run wrastlin-service:close-submissions`

---

## Step 2: Show Generation

**Status: Partially built — outline is real, everything after it is a stub**

The pipeline runs in stages: outline → beats → screenplays → audio. Only the outline uses a real AI call.

**What exists (real):**
- Show outline agent (OpenAI gpt-4o) — reads wrestler roster, submissions, previous outlines; books the card using a priority algorithm based on bribe amounts
- Full pipeline orchestrator with run logs (JSONL), fault-tolerant resume on failure
- State transitions: `submissions_closed → show_generated`
- CLI: `pnpm nx run wrastlin-service:generate-show`

**What exists (stubs):**
- Match beats — hardcoded 5-beat sequence, first participant always wins clean
- Promo screenplay — single one-liner per wrestler, no personality or context
- Announcer screenplay — reads beats verbatim, no interpretation

**What's missing:**
- Real match beats agent (AI or deterministic logic with actual match variety)
- Real announcer agent (color commentary, crowd reactions, drama)
- TTS audio generation — ElevenLabs key is in `.env.example` but the pipeline skips it with `--skip-tts`; no code generates audio yet

**Playable without:** You can run a show and the outline + promo screenplays will be real AI content with narrative context. Match beats and announcer commentary remain stubs. No audio means no playback at the live event.

---

## Step 3: Live Event + Betting

**Status: Built**

Admin opens the betting window before the show starts. Players create propositions and place bets during the live event while audio plays.

**What exists:**
- `POST /bets/propositions` — create a proposition with statement + options
- `POST /bets/propositions/:id/entries` — place a bet (managerId, optionId, amount)
- `GET /bets/propositions`, `GET /bets/entries`, `GET /bets/state`
- Betting window state: open → closed → settled
- Frontend: proposition list, create form, detail view with per-option pool display
- Real-time pool totals per option

**Admin actions:**
- `pnpm nx run wrastlin-service:open-betting`
- `pnpm nx run wrastlin-service:close-betting`

---

## Step 4: Betting Resolution

**Status: Built**

After the show, the AI judge reads each proposition against the show JSON and rules on winners. Payouts are calculated proportionally and written to managers' money balances.

**What exists:**
- Judge agent (OpenAI gpt-4o) — receives proposition statement, options, full show output; returns winning option(s), rationale, confidence level
- Ambiguous propositions are flagged and skipped (requires manual resolution)
- Manual resolution CLI for edge cases
- Proportional payout: each winner gets `(their stake / total winning stake) * total pool`
- Payouts written to `managers.json`

**Admin actions:**
- `pnpm nx run wrastlin-service:run-judge`
- `pnpm nx run wrastlin-service:resolve-proposition -- --id {id} --winning-option {optionId}`
- `pnpm nx run wrastlin-service:apply-payouts`

---

## Step 5: Participation Income

**Status: Missing**

Wrestlers should earn money just for appearing on the show, independent of betting. This creates a baseline income that keeps the game going for players who don't bet or whose bets don't pay out.

**Intended mechanics (not yet decided in code — needs discussion):**
- Flat fee for appearing on the show at all
- Bonus for appearing in the main event
- Bonus for winning

**What's needed:**
- Decision on amounts and rules
- New function to read the show JSON, find which wrestlers appeared and in what position, and apply income to their manager's money
- New CLI target: `pnpm nx run wrastlin-service:apply-participation-income`

**Note:** Wrestlers don't have their own money field. Earnings go to the manager.

---

## Step 6: End-of-Week Memory

**Status: Data model + thought process + retrieval + prompt integration built — post-show mutation missing**

The architecture is a Narrative RAG system: discrete events and evolving social threads are stored as structured data and retrieved to give agents narrative context each week.

### What's built (sub-project 1 of 4 — complete)

- `NarrativeEvent` type — immutable record of what happened: participants, description, tags, week
- `SocialThread` type — persistent narrative construct: subjects, tags, actor states (per-wrestler `care` 1–10, `stance`, `summary` prose), linked event IDs
- `loadEvents`/`saveEvents`/`loadThreads`/`saveThreads` wired into gameState
- Round-trip tests passing
- Old `memories[]` and `relationships[]` removed from the Wrestler type (clean break)
- Storage: `data/runtime/events.json` and `data/runtime/threads.json`

### What's missing

The end-of-week memory work fits into the weekly sequence like this:

```
submissions close
    ↓
wrestler thought process   ← BUILT (sub-project 2)
    ↓
generate show              ← uses thought process output as context
    ↓
post-show mutations        ← NEW (sub-project 3)
    ↓
advance week
```

---

**Sub-project 2: Wrestler thought process** — BUILT

Runs as Step 0 inside `generate-show`. All wrestlers run in parallel before the outline is booked.

- `WrestlerThoughtProcessInput` / `WrestlerThoughtProcessOutput` types in `agents/types.ts`
- `buildWrestlerThoughtProcessInput` — filters all threads to only those where this wrestler is a subject or actor
- `stubWrestlerThoughtProcessAgent` — deterministic stub for `--stub` mode
- `openaiWrestlerThoughtProcessAgent` — calls gpt-4o; parses `thoughtSummary` + `threadUpdates` (care 1–10, stance, summary per thread)
- Prompt template: `prompts/wrestler-thought-process.md`
- Output stored in `GeneratedShow.wrestlerThoughtProcess[]` (saved to `data/shows/week-N.json`)
- Output passed to the outline agent as context (`ShowOutlineInput.wrestlerThoughtProcess`)
- Threads themselves are NOT mutated here — that happens in sub-project 3 (post-show)
- `generate-show --stub --force` prints per-wrestler thought summaries in console output

**Sub-project 3: Post-show mutation pipeline** — runs after generate-show

Reads the generated show and updates the narrative state to reflect what actually happened.

- **Event extraction (structural, no AI):** derive `NarrativeEvent` records from the show JSON
  - Match result: winner, loser, finish type (clean/dirty/interference/dq), headliner status
  - Interference: any wrestler in `segment.interference`
  - Promo callout: promo segment where a `target` is specified
- **Thread mutation (AI):** AI agent reads the new events + existing threads + wrestler roster
  - Decides what new threads to create (one event can spawn multiple threads — a match result might create a rivalry thread AND a dominance thread)
  - Decides what existing threads to update with the new events
  - Writes `actorStates` (care, stance, summary) for all involved wrestlers on each thread
  - There is no fixed rule for what threads an event creates — the AI determines this from context
- **Emotional state update:** apply winner/loser confidence and frustration changes to `wrestlers.json`
- CLI target: `pnpm nx run wrastlin-service:apply-post-show-updates`

**Sub-project 4: Retrieval engine** — BUILT

Given a task, score and rank threads by relevance.

- `retrieveRelevantThreads(query, allThreads, allEvents): RetrievedThread[]` in `src/retrieval/retrieveThreads.ts`
- Scoring: care level × recency × tag match × subject match
- Returns ranked list of threads + their recent events for injection into a prompt

**Sub-project 5: Prompt integration** — BUILT

- Show outline prompt now receives `{{WRESTLER_THOUGHT_PROCESS_JSON}}` and `{{ACTIVE_THREADS_JSON}}` — the booker knows who has unfinished business and what feuds are hot
- Promo screenplay prompt now receives `{{RELEVANT_THREADS_JSON}}` — per-segment retrieval for the promo's participants and target
- `PREVIOUS_OUTLINES_JSON` was always wired in the prompt but passed as `[]` — now loads real prior show outlines from disk
- Real OpenAI promo screenplay agent added (`openaiPromoScreenplayAgent.ts`) — replaces the stub for non-`--stub` runs

---

## Step 7: Advance Week

**Status: Built**

Resets the phase back to `week_open` and increments the week counter.

**What exists:**
- `POST /state/advance-week`
- Valid transition: `show_generated → week_open`
- Week counter increments, timestamps updated

**Admin action:** `pnpm nx run wrastlin-service:advance-week`

---

## Summary

| Step | Status | Blocker for first run? |
|------|--------|----------------------|
| 1. Submissions | Built | No |
| 2. Show generation | Partial — no real content agents, no audio | Yes — need audio for live event |
| 3. Live betting | Built | No |
| 4. Betting resolution | Built | No |
| 5. Participation income | Missing | No — could do manually first run |
| 6. End-of-week memory | Partial — data model, thought process, retrieval, and prompt integration done; post-show mutation missing | No — first run has no history anyway |
| 7. Advance week | Built | No |

---

## What's Needed to Actually Run a Session

**Must have:**
- Real match beats agent (or at minimum enough variety in the stub to feel different each week)
- TTS audio generation wired into the pipeline (the live event needs something to play)

**Nice to have for first run:**
- Participation income (can track manually in a spreadsheet for week 1)
- Post-show mutation (first week has no prior history, so this doesn't matter yet — but worth building now so week 2 has context)

**Already done:**
- Auth + player accounts
- Betting (full flow)
- Admin CLI tooling for state transitions
- Show outline (real AI booking with narrative context)
- Promo screenplay (real AI with wrestler personality, threads, rivalries)
- Wrestler thought process (runs before outline; gives each wrestler an inner monologue)
- Retrieval engine (scores and ranks story threads by relevance per context)
- Previous show outlines fed back into the booking agent
