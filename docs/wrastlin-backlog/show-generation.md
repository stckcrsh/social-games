# Show Generation

The AI pipeline that turns a week's submissions into a full show: outline →
match beats → promo screenplays → announcer screenplay → (eventually) audio.

## Status: Mostly real, two pieces left

Corrected from `apps/wrastlin/GAME_STATUS.md`, which is stale on one point
as of this writing — **match beats is real, not a stub** (shipped in commit
`7b785bf`, after `GAME_STATUS.md` was last updated). Worth a follow-up edit
to that file.

**Real (AI-backed):**
- Show outline (OpenAI gpt-4o) — books the card from submissions, wrestler
  thought process, and active story threads; uses an explicit
  priority-ranking algorithm on bribe amounts (not soft weighting)
- Wrestler thought process (Step 0) — runs before the outline, gives every
  wrestler an inner monologue informed by relevant story threads
- Match beats (OpenAI gpt-4o) — real agent as of `openaiMatchBeatsAgent.ts`
- Promo screenplay (OpenAI gpt-4o) — real agent with thread/rivalry context

**Stub only:**
- Announcer screenplay — reads match beats verbatim, no color commentary,
  no crowd-reaction interpretation (`stubAnnouncerScreenplayAgent.ts`; no
  real implementation exists yet)

**Not implemented at all:**
- TTS audio — `audio/tts.ts` is just a type interface (`TtsProviderFn`),
  no provider is wired in; `generate-show` always prints "TTS: not yet
  implemented" unless `--skip-tts` is passed. This is the actual blocker
  for a live event — there's currently nothing to play for the group.

**Infra that's solid regardless of agent content:**
- Full pipeline orchestrator with JSONL run logs, fault-tolerant resume
- Promptfoo test harness against the real prompt-rendering pipeline
  (fixed/hardened recently — see commits `d67817e`, `1155cb9`)
- `print-prompt` CLI to inspect exactly what was sent to the model

## Requirements / FRD ticket

- [ ] **Write the requirements doc for show generation.** Key open questions: what does "good" announcer commentary actually need to contain (crowd reaction color, callback to past feuds, contrasting the actual match beats)? What's the TTS provider decision (ElevenLabs is in `.env.example` but nothing beyond a prompt guide exists — `apps/wrastlin/docs/elevenLabsPromptGuide.md`)? Is one voice per wrestler required for launch, or is a single narrator voice acceptable for v1? What happens if TTS generation fails mid-show — is there a text-fallback path?

## Remaining tickets

- [ ] **Real announcer agent** — replace the stub; needs its own prompt (there's already a slot for `announcer-screenplay` in the prompt system) and probably needs promptfoo scenarios like the outline/beats/promo agents already have
- [ ] **Wire a real TTS provider into the pipeline** — implement `TtsProviderFn` for real (ElevenLabs, per `.env.example` and the existing prompt guide), call it from `generate-show` instead of the "not yet implemented" branch
- [ ] **Surface generated audio somewhere playable** — currently there's no results page; audio needs a destination once it exists (ties into judging/results UI, see `judging-and-payouts.md`)
- [ ] **Correct `apps/wrastlin/GAME_STATUS.md`** — update the match-beats status now that it's real, not stub (small doc fix, flagged here rather than done silently since it's outside the scope of what was asked)
- [ ] **`apps/wrastlin/docs/12_launch_checklist.md` critical path is stale** — says "currently only `--stub` mode works," no longer true for outline/beats/promo; needs a pass once the requirements doc above resolves what's actually left
