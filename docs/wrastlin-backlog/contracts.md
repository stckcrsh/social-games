# Cross-Section Contracts

Each section in this backlog can be built independently, but they hand data
to each other in a fixed sequence. This is the actual data flow, so changes
to one section's output shape are changes to another section's input
contract — check here before reshaping a type.

```
Submissions                                Show Generation
  WeeklySubmission[]  ───────────────────▶  ShowOutlineInput
  (submission.ts)         + wrestlers[]        (wrestlers, managers,
                          + managers[]          submissions, wrestler
                          + wrestlerThoughtProcess[]  thought process,
                          + activeThreads[]           active threads)
                                                   │
                                                   ▼
                                                Show
                                            (show.ts: segments[],
                                             each with optional
                                             MatchResult)
                                                   │
                       ┌───────────────────────────┼───────────────────────────┐
                       ▼                           ▼                           ▼
                   Betting                    Judging                  End-of-Week Memory
              BetProposition created      Judge reads Show +      Structural extraction reads
              referencing the show's      each BetProposition,    Show → NarrativeEvent[];
              matches/segments             writes `judgement`      AI thread mutation reads
              (statement is free text,     { winningOptionIds,      events + existing
              not type-linked to Show —    rationale, confidence }  SocialThread[] + roster
              this is a soft coupling,                                  │
              not a type dependency)              │                     ▼
                       │                           ▼                Updated threads +
                       ▼                      Payouts                wrestler emotional state
                  BetEntry[]              (proportional split
                  (bets placed             of pool by winning        ┌─────────────┐
                   against options)        stake) + Participation ──▶│ Next week's │
                       │                    Income (reads Show for   │ submissions  │
                       └──────────────────▶ appearances) both write  │  + show gen  │
                                            to manager money           └─────────────┘
```

## The contracts, concretely

- **Submissions → Show Generation:** `WeeklySubmission[]` joined with
  `Manager[]` (managerId → wrestlerId). **Known failure mode:** if the
  manager join is missing/wrong, submissions are silently dropped and the
  model receives an empty submissions array — the show still generates,
  it just ignores every bribe and story request. (Documented in
  `apps/wrastlin/meta-service/CLAUDE.md`.)

- **Show Generation → Betting:** no formal type dependency — betting
  propositions are free-text statements a manager writes after seeing the
  match list, not derived programmatically from the `Show` type. This is
  intentional (keeps betting decoupled, which matters for the
  shared-library goal — see `betting.md`) but means there's no compile-time
  check that a proposition references a real match/segment.

- **Show Generation → Judging:** the judge agent receives the full `Show`
  object plus a proposition's `statement`/`options` and returns a
  `judgement` matching the shape already on `BetProposition`. This is the
  one place betting and show-generation actually touch — worth keeping in
  mind if betting becomes a shared library (see the judge-ownership
  question in `betting.md`'s requirements ticket).

- **Betting + Judging → Payouts:** payouts read `BetProposition.judgement`
  and every `BetEntry` referencing that proposition, compute proportional
  splits, write to `managers.json`.

- **Show Generation → Participation Income:** reads `Show.segments` to
  determine which wrestlers appeared and in what position — independent of
  betting/judging entirely, can run in parallel with that pipeline.

- **Show Generation → End-of-Week Memory:** structural event extraction
  reads `Show` directly (no AI); the thread-mutation agent additionally
  needs the current `SocialThread[]`/`NarrativeEvent[]` state and the
  wrestler roster.

## Open contract questions (surfaced by writing this doc)

- [ ] Should betting propositions gain a *soft* reference to a segment/match
  ID (optional, not required) so results UI can auto-highlight "this bet
  was about this match"? Currently nothing links them.
- [ ] Payouts and participation income both write manager money — do they
  need to run in a specific order, or are they independent enough to run
  in parallel? (Relevant once participation income is implemented.)
- [ ] If betting becomes a shared library, does "Show Generation → Judging"
  become the library's external interface boundary (i.e., the library
  takes `{ statement, options, arbitraryContextBlob }` and doesn't know
  what a `Show` is), or does judging stay entirely game-side and the
  library only owns propositions/entries/payout math?
