# Implementation Build Order

The system should be implemented in the following order.

---

# Phase 1 — Core Data Model

Implement schemas for:

- wrestlers
- managers
- rivalries
- memories
- weekly submissions

---

# Phase 2 — Persistence Layer

Implement storage for:

- wrestlers
- managers
- shows
- submissions
- memories

Flat JSON files are acceptable for MVP.

---

# Phase 3 — Wrestler Decision Engine

Build the logic for:

- evaluating manager advice
- updating emotions
- updating trust
- recording memories

---

# Phase 4 — Storyteller Engine

Implement:

- show generation pipeline
- segment generation
- match resolver

At this stage, the system should generate structured show results.

---

# Phase 5 — AI Narrative Layer

Add AI generation for:

- promos
- commentary
- dialogue

Ensure AI text references structured results.

---

# Phase 6 — Weekly Orchestrator

Implement lifecycle states:

week_open  
submissions_open  
show_generation  
results_published  

---

# Phase 7 — Betting System

Add:

- betting pool
- odds calculation
- payout resolution

---

# Phase 8 — Manager UI

Allow managers to:

- talk to wrestlers
- submit advice
- submit show requests
- place bets