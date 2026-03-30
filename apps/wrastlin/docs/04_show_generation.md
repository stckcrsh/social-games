# Show Generation System

The storyteller engine generates a weekly wrestling episode.

## Inputs

- current world state
- wrestler states
- manager submissions
- betting data
- rivalry heat

## Pipeline

1. Load world state
2. Calculate story pressure
3. Generate segment candidates
4. Assemble show card
5. Resolve segments
6. Resolve matches
7. Generate narration
8. Update world state

## Segment Types

Examples:

- opening promo
- singles match
- backstage confrontation
- interview
- betrayal
- title match
- main event

## Match Resolution Factors

Matches consider:

- wrestler stats
- momentum
- emotional state
- manager guidance
- rivalry heat
- cheating tendencies
- interference opportunities

## Finish Types

Possible finishes:

- clean win
- dirty win
- interference
- count-out
- disqualification
- no contest