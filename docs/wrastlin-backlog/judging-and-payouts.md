# Judging & Payouts

After the show ends and betting closes, an AI judge rules on each
proposition against the generated show, and winnings get paid out.

## Status: Built

- Judge agent (OpenAI gpt-4o) — reads proposition statement + options +
  full show output, returns winning option(s), rationale, confidence
- Ambiguous propositions are flagged and skipped, requiring manual
  resolution (`resolve-proposition` CLI)
- Proportional payout: `(stake / total winning stake) * total pool` per winner
- Payouts written to `managers.json`
- Admin CLI: `run-judge`, `resolve-proposition -- --id <id> --winning-option <optionId>`, `apply-payouts`

## Requirements / FRD ticket

- [ ] **Write the requirements doc for judging & payouts.** Open questions:
  what happens to a proposition's pool if it's never resolved (abandoned
  week, judge never run)? Is there a house edge / rake, or is 100% of the
  pool always redistributed? Should losing bettors see *why* they lost
  (the judge's rationale), or is that admin-only? What's the actual UX for
  "ambiguous, needs manual resolution" — right now that's a CLI flag; does
  a real session need a lighter-weight admin UI for this instead?

## Remaining tickets

- [ ] **Show results UI** — right now results only exist as a JSON file on
  disk; players need a way to see what happened after the show runs
  (carried over from `apps/wrastlin/docs/12_launch_checklist.md`)
- [ ] **Simple admin "show runner" flow** — a guided CLI or minimal UI to
  close submissions → generate show → open betting → close betting → judge
  → payouts → advance week, without hand-running each NX target and
  manually editing JSON for edge cases
- [ ] **Post-show wrestler recap** — after judging, show each manager what
  happened to their wrestler (win/loss, how their submission was used, any
  stat changes) — ties into end-of-week memory's emotional-state updates
