# End-of-Week Memory

The Narrative RAG system: discrete events and evolving social threads
(rivalries, grudges, alliances) are stored as structured data and retrieved
to give agents narrative context each week.

## Status: 4 of 5 sub-projects built — post-show mutation is the gap

**Built:**
- Data model — `NarrativeEvent` (immutable record of what happened) and
  `SocialThread` (persistent construct: subjects, tags, per-wrestler actor
  states of care/stance/summary, linked event IDs); old `memories[]`/
  `relationships[]` removed from the Wrestler type as a clean break
- Wrestler thought process — runs as Step 0 in `generate-show`, gives every
  wrestler an inner monologue informed by threads they're involved in
- Retrieval engine — `retrieveRelevantThreads(query, allThreads, allEvents)`,
  scores by care level × recency × tag match × subject match
- Prompt integration — show outline gets wrestler thought process + active
  threads; promo screenplay gets per-segment relevant threads; previous
  show outlines are now actually loaded from disk instead of passed as `[]`

**Missing:**
- Post-show mutation pipeline — the piece that reads what actually
  happened and writes it back into the narrative state:
  - Structural event extraction (no AI): match results, interference,
    promo callouts, derived directly from the show JSON
  - AI thread mutation: an agent reads new events + existing threads +
    roster, decides what threads to create/update, writes actor states
  - Emotional state update: apply winner/loser confidence/frustration
    changes to `wrestlers.json`
  - Planned CLI target: `apply-post-show-updates`

## Requirements / FRD ticket

- [ ] **Write the requirements doc for post-show mutation.** Open
  questions: how many threads can one event reasonably spawn (unbounded,
  per the AI's judgment, per the current design intent — should there be
  a soft cap)? How does thread staleness/decay work — do old threads ever
  get archived or do they accumulate forever? What's the failure mode if
  the mutation agent's output conflicts with itself (e.g. contradictory
  actor states across two threads about the same event)?

## Remaining tickets

- [ ] **Structural event extraction** from show JSON (match results,
  interference, promo callouts) — no AI needed, this is derivable directly
- [ ] **AI thread mutation agent** — reads events + threads + roster,
  creates/updates threads, writes actor states
- [ ] **Emotional state update** — winner/loser confidence and frustration
  changes applied to `wrestlers.json`
- [ ] **`apply-post-show-updates` CLI target**, wired into the weekly
  sequence between show generation and advance-week
- Note from `GAME_STATUS.md`: this doesn't block a first playable week
  (there's no history yet in week 1), but building it before week 2 means
  week 2 actually has narrative continuity — worth prioritizing early even
  though it's not a hard blocker.
