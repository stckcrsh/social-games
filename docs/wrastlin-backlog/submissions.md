# Submissions

The busy-work phase's only touchpoint with the app: each manager submits
their weekly orders (story request, bribe, optional message to their
wrestler) before the show generates.

## Status: Built

- `POST /submissions` — accepts `managerId`, `showRequest`, `bribeAmount`, `storyRequests[]` (type/target/bribeAmount), optional `wrestlerMessage`
- One submission per manager per week (duplicate prevention)
- `GET /submissions/week/:week`
- Frontend form with all fields
- Type: `WeeklySubmission` in `libs/wrastlin/shared/src/types/submission.ts`

## Requirements / FRD ticket

- [ ] **Write the requirements doc for submissions.** What's actually settled vs. still assumed? E.g.: is one submission per week per manager the permanent rule, or do we want to allow amending a submission before the window closes? Is `bribeAmount` capped by the manager's current money balance anywhere (server-side), or just trusted client-side? Should `storyRequests` support more than one request per submission, and if so how do multiple bribes on the same submission interact with the priority-ranking algorithm in show generation?

## Remaining tickets

- [ ] **Enforce bribe amount against manager's balance** — currently nothing stops a manager from submitting a bribe they can't afford; decide whether to validate at submission time or at show-generation time (or both)
- [ ] **Wrestler name picker in the UI** — opponent/story-target fields currently take raw wrestler IDs (e.g. `w-002`); replace with a dropdown of real names (carried over from `apps/wrastlin/docs/12_launch_checklist.md`, still true)
- [ ] **Explain story request types in the UI** — "feud", "betrayal", "title-shot" etc. have no player-facing explanation of what they do mechanically
- [ ] **Show existing submission if already submitted** — currently a manager who already submitted this week just sees a blank form again
- [ ] **Show manager's money balance in the submission UI** — not displayed anywhere right now, but it directly informs how much to bribe
