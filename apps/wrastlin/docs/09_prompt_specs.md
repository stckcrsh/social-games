# AI Prompt Specifications

AI should be used for **dialogue and narrative only**.

Game logic must remain deterministic.

---

# Wrestler Conversation Prompt

Input:

- wrestler personality
- wrestler emotions
- manager trust
- recent memories
- manager message

Goal:

Generate a wrestler response that reflects personality and emotional state.

Output:

{
  "response": "text",
  "trustChange": 0,
  "emotionChanges": {}
}

---

# Promo Generation Prompt

Input:

- wrestler personality
- current rivalry
- recent memories
- show context

Output:

Promo text.

Promos should:

- reference history
- insult rivals
- reflect personality traits.

---

# Match Commentary Prompt

Input:

- match participants
- match result
- finish type
- major moments

Output:

Narrated match description.

---

# Show Recap Prompt

Input:

- list of segments
- match results
- rivalries advanced

Output:

Full show recap.