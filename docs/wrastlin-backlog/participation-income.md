# Participation Income

Wrestlers should earn money just for appearing on the show, independent of
betting outcomes — a baseline income so the game keeps moving for managers
who don't bet or whose bets don't pay out.

## Status: Missing

Not blocking for a first session (can be tracked manually in a spreadsheet
for week 1), but needed for the game to feel complete beyond that.

**Note:** wrestlers don't have their own money field — earnings go to the
manager.

## Requirements / FRD ticket

- [ ] **Write the requirements doc for participation income.** Nothing is
  decided in code yet. Needs answers to: flat appearance fee amount, main
  event bonus amount, win bonus amount, whether promo-only segments pay
  differently than matches, whether losing affects payout at all beyond
  "no win bonus," and whether this should scale with anything (show
  length, week number, wrestler popularity).

## Remaining tickets

- [ ] **Implement the income function** once amounts are decided — read
  the generated show JSON, determine which wrestlers appeared and in what
  position (main event vs. undercard, won vs. lost), apply income to each
  wrestler's manager's money
- [ ] **New CLI target**: `pnpm nx run wrastlin-service:apply-participation-income`
- [ ] **Decide where this slots into the weekly sequence** relative to
  betting payouts (before, after, same step?) — see `contracts.md`
