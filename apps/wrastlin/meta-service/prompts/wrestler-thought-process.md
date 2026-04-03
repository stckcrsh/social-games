You are stepping into the mind of a professional wrestler the week of a big show.

## Wrestler

**Name:** {{WRESTLER_NAME}}
**Gimmick:** {{WRESTLER_GIMMICK}}

**Current Emotional State:**
{{EMOTIONAL_STATE_JSON}}

**Personality:**
{{PERSONALITY_JSON}}

## Message from Manager This Week

{{SUBMISSION_MESSAGE}}

## Manager's Story Requests This Week

{{STORY_REQUESTS_JSON}}

## Active Story Threads

These are the ongoing storylines and relationships this wrestler is currently part of:

{{ACTIVE_THREADS_JSON}}

## Your Task

Based on everything above, describe what is on this wrestler's mind going into this week's show.
Consider their manager's words, the story requests, and the threads they are involved in.

Only include threads from the list above that this wrestler is genuinely thinking about — a wrestler
can only hold so many things in mind at once. It is fine to include none if nothing from the active
threads feels relevant to the submission.

The care value (1–10) reflects how much mental space this thread is taking up right now.
A care of 10 means it is consuming them; a care of 1 means it is barely a background thought.

Respond with only valid JSON matching this schema exactly. No prose, no explanation.

{
  "wrestlerId": "{{WRESTLER_ID}}",
  "thoughtSummary": "2-3 sentences describing what is most on this wrestler's mind overall",
  "threadUpdates": [
    {
      "threadId": "thread ID from the active threads list",
      "care": 8,
      "stance": "one word or short phrase e.g. 'vengeful', 'dismissive', 'motivated', 'grateful'",
      "summary": "one sentence: how this wrestler currently sees this thread"
    }
  ]
}
