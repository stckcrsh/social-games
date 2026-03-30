# System Architecture

The wrestling legacy game consists of four primary subsystems:

1. Game Server
2. Wrestler AI Agents
3. Storyteller / Show Engine
4. Persistence Layer

The system runs on a **weekly orchestration cycle**.

---

# High Level Architecture

Managers -> Game Server -> Wrestler AI
Managers -> Game Server -> Submission System

Submission System -> Storyteller Engine
Wrestler State -> Storyteller Engine

Storyteller Engine -> Match Resolver
Storyteller Engine -> Segment Resolver

Resolvers -> Narration AI

Narration AI -> Show Script

Show Script -> Game Server -> Players

Results -> World State -> Persistence

---

# Subsystems

## Game Server

Responsibilities:

- player login
- manager interactions
- submission handling
- betting system
- orchestration of weekly show generation
- API endpoints

Recommended stack:

Node.js / TypeScript

---

## Wrestler AI Agents

Each wrestler is represented by an AI decision agent.

Responsibilities:

- respond to manager conversation
- generate promos
- evaluate manager advice
- determine emotional reactions

The AI agent does not determine match winners.

---

## Storyteller Engine

Responsible for building the weekly show.

Pipeline:

1. Load world state
2. Evaluate story pressure
3. Generate segment candidates
4. Assemble show card
5. Resolve segments
6. Resolve matches
7. Generate narration

---

## Match Resolver

Deterministic system responsible for:

- calculating match outcomes
- evaluating interference
- determining finish types

AI should not decide the winner directly.

---

## Narration System

LLM usage for:

- match commentary
- promos
- backstage dialogue
- show recaps

---

# Weekly Orchestrator

The orchestrator handles the weekly lifecycle.

States:

- week_open
- submissions_open
- show_generation
- results_published
- next_week_ready

The orchestrator ensures consistent timing and prevents mid-show changes.