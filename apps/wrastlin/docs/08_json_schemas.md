# JSON Schemas

Below are suggested data structures for core entities.

---

# Wrestler

{
  "wrestlerId": "uuid",
  "name": "string",
  "gimmick": "string",

  "stats": {
    "strength": 0,
    "agility": 0,
    "endurance": 0,
    "charisma": 0
  },

  "personality": {
    "ego": 0,
    "anger": 0,
    "honor": 0,
    "loyalty": 0,
    "ambition": 0
  },

  "emotions": {
    "confidence": 0,
    "frustration": 0,
    "fatigue": 0
  },

  "relationships": [
    {
      "targetId": "wrestlerId",
      "respect": 0,
      "hatred": 0,
      "trust": 0
    }
  ],

  "memories": [],

  "managerTrust": 0
}

---

# Memory

{
  "memoryId": "uuid",
  "type": "humiliation | betrayal | victory | injury | promo",
  "source": "wrestlerId",
  "target": "wrestlerId",
  "week": 0,
  "intensity": 0
}

---

# Manager

{
  "managerId": "uuid",
  "wrestlerId": "uuid",
  "money": 0,
  "trustLevel": 0
}

---

# Weekly Submission

{
  "managerId": "uuid",
  "week": 0,

  "advice": {
    "matchStyle": "aggressive",
    "target": "wrestlerId"
  },

  "storyRequests": [
    {
      "type": "promo",
      "target": "wrestlerId",
      "bribe": 100
    }
  ]
}

---

# Match Result

{
  "matchId": "uuid",
  "participants": ["wrestlerA","wrestlerB"],
  "winner": "wrestlerA",
  "finishType": "clean | dirty | interference | dq",
  "crowdReaction": 0
}