# Wrastlin — Completion Backlog

What's left to get Wrastlin to a real, playable weekly session. Lives at the
repo root (not under `apps/wrastlin/`) because at least one piece of this
(betting) is meant to graduate into a cross-game shared library, not stay
wrastlin-specific.

> For current, always-accurate implementation status of what's already
> built, see [`apps/wrastlin/GAME_STATUS.md`](../../apps/wrastlin/GAME_STATUS.md).
> This backlog is the forward-looking complement to that doc: what remains,
> organized as tickets.
>
> The older `apps/wrastlin/docs/01_overview.md`, `02_weekly_game_loop.md`,
> `06_requirements.md`, and `11_build_order.md` describe an earlier design
> (an async "chat with your wrestler" game with a wrestler decision engine,
> trust, relationships) that was superseded by the submission-based weekly
> design below. Treat them as historical, not current — this backlog and
> `GAME_STATUS.md` are the sources of truth going forward.

## The Two Phases

**Busy work** (during the week, outside this app — Discord, IRL):
Managers talk to each other, scheme, negotiate. At some point they submit
their orders for the week through the app.

**Social gathering** (the live event — a Zoom call or similar):

```
close submissions
    ↓
generate show
    ↓
post match list, open betting window
    ↓
play the show for everyone
    ↓
close betting, judge winners
    ↓
pay out bets
    ↓
open next week's submissions → back to busy work
```

## Distinct Work Sections

Each of these can be built/iterated on independently, but they pass data to
each other — see [`contracts.md`](contracts.md) for the exact shapes. Each
section below has its own file with: current status, an explicit
**requirements/FRD ticket**, and the remaining implementation tickets.

| Section | File | Can build standalone? |
|---------|------|------------------------|
| Submissions | [`submissions.md`](submissions.md) | Yes |
| Show generation | [`show-generation.md`](show-generation.md) | Yes (needs submissions as input, but the pipeline itself is independent) |
| Betting | [`betting.md`](betting.md) | Yes — and the goal is to make it independent of Wrastlin entirely (shared library) |
| Judging & payouts | [`judging-and-payouts.md`](judging-and-payouts.md) | Yes (needs a show + propositions as input) |
| Participation income | [`participation-income.md`](participation-income.md) | Yes |
| End-of-week memory | [`end-of-week-memory.md`](end-of-week-memory.md) | Yes |
| Cross-section contracts | [`contracts.md`](contracts.md) | N/A — this is the glue |

## Priority

Per `GAME_STATUS.md`'s "What's Needed to Actually Run a Session": the two
blockers for a first real playable week are the announcer agent (or
accepting the stub for now) and TTS audio. Everything else can be
sequenced after that. See each section file for specifics.
