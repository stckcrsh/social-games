# Launch Checklist — Playing With Friends

High-level items remaining to make Wrastlin playable with a real group of managers.

---

## Critical Path

These must be done in order — each one unlocks the next.

- [ ] **Wire real Claude agents into `generate-show`** — currently only `--stub` mode works; real AI agent implementations need to be written and connected
- [ ] **Write and tune the 4 AI prompts** — show-outline, match-beats, promo-screenplay, announcer-screenplay need iteration until the output is actually compelling
- [ ] **Run the full pipeline end-to-end** — verify a real generated show makes sense and is worth watching

---

## Player Experience

- [ ] **Show results UI** — players need a way to see what happened after the show runs; right now results are only saved as a JSON file
- [ ] **Auth / player identity** — managers need to log in and only see their own wrestler, not everyone else's dashboard
- [ ] **Show history** — some way to browse past weeks and results

---

## Admin Tooling

- [ ] **Show runner flow** — a simple UI or guided CLI to close submissions, run the show, and advance the week without manually editing JSON files

---

## Audio (Optional but fun)

- [ ] **Integrate TTS into the pipeline** — generate audio automatically as part of `generate-show` rather than running the TTS script separately
- [ ] **Surface audio on the results page** — players can listen to the show after it runs

---

## Deployment

- [ ] **Host it somewhere friends can reach** — even a simple setup (ngrok, fly.io, $5 VPS) so managers don't need to run it locally

---

## Wrestler Dashboard Refinements

Working, but needs polish before it makes sense to new players.

- [ ] **Show manager's money balance** — currently not displayed anywhere; critical since it drives both bribes and betting
- [ ] **Explain what stats and personality traits do** — players have no idea what high Ego or low Honor means for their wrestler's matches
- [ ] **Show emotional state trend** — seeing Frustration = 6 is meaningless without knowing if it went up or down from last week
- [ ] **Post-show wrestler recap** — after a show airs, show the manager what happened to their wrestler: win/loss, how the submission was used, any stat changes

---

## Submission Form Refinements

Working, but has UX friction that will cause confusion.

- [ ] **Wrestler name picker** — opponent and story target fields currently accept raw IDs (e.g. `w-002`); replace with a dropdown of real wrestler names
- [ ] **Explain story request types** — "feud", "betrayal", "title-shot" mean nothing without a description of what each does mechanically
- [ ] **Bribe context** — show the manager's current balance and a plain-English hint of what bribes do, so players know if it's worth spending
- [ ] **Show existing submission** — if a manager has already submitted this week, show them what they submitted instead of a blank form

---

## Betting Refinements

Working, but the resolution experience is incomplete.

- [ ] **Highlight winning option on resolved propositions** — currently resolved propositions show no indication of who won; winners need to be clearly marked
- [ ] **Show payout on resolution** — after a proposition resolves, display what the manager won (or lost) rather than just updating the balance silently
- [ ] **Require at least 2 options** — front-end validation to prevent creating a proposition with only one option

---

## Notes

The biggest unknown is **prompt quality** — expect several iterations before the show output feels right. Start there before investing in audio or deployment.
