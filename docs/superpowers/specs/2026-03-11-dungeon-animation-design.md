# Dungeon Animation System Design

**Date:** 2026-03-11
**Status:** Approved

---

## Overview

Add a lightweight client-side animation layer to the dungeon game so players can clearly understand what happened during each turn. The goal is clarity and readability, not cinematic quality. The system reads `turnEvents: GameEvent[]` from the existing WebSocket turn result and drives visual feedback through the canvas renderer and HUD.

---

## Architecture

### Data Flow

```
WebSocket turn result arrives
  → Game.tsx receives { state: RunState, turnEvents: GameEvent[] }
  → AnimationScheduler.run(turnEvents, onComplete)
       → events bucketed into phases
       → phases fire with lead-time overlap
       → canvas rAF loop reads AnimationState, redraws at 60fps
       → HUD receives signals for screen-space effects
  → onComplete fires
       → final RunState committed to React
       → canvas does clean final redraw
       → input already live (never locked)
```

### Key Principle: State Commit Timing

The new `RunState` from the server is held until `onComplete` fires. During playback the canvas draws from `AnimationState` (tweened positions, overlays). On completion React state updates and the canvas does a clean redraw from final authoritative state.

### Input During Animation

Input is never locked. If a new turn result arrives while a previous turn's animations are still running, the scheduler performs **cut-and-replace**: immediately cancel all in-flight animations, commit the previous turn's final state, and start the new turn's animations fresh. This prevents lag buildup at fast tick rates.

---

## Phase Model

Events are bucketed into four named phases. Phases play sequentially with overlap. Events within a phase play concurrently.

| Phase | Events |
|-------|--------|
| **action** | `move`, `item_activate`, `slot_switched`, `interacted`, `item_interact_tile` |
| **impact** | `attack`, `collision_attack`, `item_hit`, `item_whiff`, `item_fail`, `mine_placed`, `mine_detonated`, `explosion`, `explosion_wall_destroyed`, `explosion_entity_damage` |
| **consequence** | `fire_damage`, `fire_spread`, `oil_ignited`, `tile_changed`, `mechanism_solved`, `mechanism_reset`, `death` |
| **cleanup** | `pickup`, `room_transition`, `run_end`, `noop`, `player_action` |

Empty phases are skipped. A turn with only `move` runs only the action phase and completes in ~150ms.

### Phase Overlap

Each phase has a `duration` (how long its animations run) and a `leadTime` (how long after this phase *starts* before the next phase begins). The next phase starts while the previous phase is still running, creating a cascade effect.

```
t=0    action starts    (duration 150ms)
t=80   impact starts    (duration 180ms)
t=180  consequence starts (duration 180ms)
t=360  all done
```

Total animation budget: ~360ms, comfortably under the 500ms tick timer.

### Timing Configuration

All timing values live in one place:

```typescript
// animationConfig.ts
export const ANIMATION_CONFIG = {
  phases: {
    action:      { duration: 150, leadTime:  80 },
    impact:      { duration: 180, leadTime: 100 },
    consequence: { duration: 180, leadTime: 180 },
    cleanup:     { duration:  80, leadTime:  80 },
  },
} as const;
```

Durations and lead times can be tuned here without touching scheduler logic.

---

## Event-to-Phase Mapping

A plain lookup table in `eventToPhase.ts`:

```typescript
export const EVENT_PHASE: Record<GameEvent['type'], Phase | 'skip'> = {
  move:                    'action',
  item_activate:           'action',
  slot_switched:           'action',
  interacted:              'action',
  item_interact_tile:      'action',

  attack:                  'impact',
  collision_attack:        'impact',
  item_hit:                'impact',
  item_whiff:              'impact',
  item_fail:               'impact',
  mine_placed:             'impact',
  mine_detonated:          'impact',
  explosion:               'impact',
  explosion_wall_destroyed:'impact',
  explosion_entity_damage: 'impact',

  fire_damage:             'consequence',
  fire_spread:             'consequence',
  oil_ignited:             'consequence',
  tile_changed:            'consequence',
  mechanism_solved:        'consequence',
  mechanism_reset:         'consequence',
  death:                   'consequence',

  pickup:                  'cleanup',
  room_transition:         'skip',
  run_end:                 'skip',
  noop:                    'skip',
  player_action:           'skip',
  run_start:               'skip',
};
```

Adding a new event type = adding one line to this table.

---

## Animation Primitives

Pure functions that take `progress: number` (0→1) and return drawable instructions. They do not own time and have no side effects — trivially unit-testable.

### World-space primitives (canvas)

| Primitive | Signature | Used for |
|-----------|-----------|----------|
| `slide` | `(from: Pos, to: Pos, progress: number) => Pos` | `move` — interpolate entity between tiles |
| `lunge` | `(origin: Pos, toward: Pos, progress: number) => Pos` | `attack`, `collision_attack` — nudge attacker 30% toward target then snap back |
| `flash` | `(color: string, progress: number) => string` | `item_hit`, `explosion_entity_damage`, `fire_damage` — alpha-blended color overlay on entity |
| `projectile` | `(from: Pos, to: Pos, progress: number) => Pos` | `item_activate` ranged — small shape traveling along tile-space line |
| `burst` | `(center: Pos, radius: number, progress: number) => BurstFrame` | `explosion`, `mine_detonated` — expanding circle with fade |
| `tileFlash` | `(color: string, progress: number) => string` | `tile_changed`, `oil_ignited`, `fire_spread`, `mine_placed` — color overlay on tile |
| `collapse` | `(progress: number) => { scale: number; alpha: number }` | `death` — entity shrinks and fades |
| `appear` | `(progress: number) => { scale: number }` | `mine_placed` — tile object scales up from 0 |

`progress` is computed by the scheduler's rAF loop and passed down — primitives are pure functions of progress only.

### HUD signals (React)

| Signal | Trigger | Effect |
|--------|---------|--------|
| `slotFlash` | `slot_switched` | Brief highlight on active slot indicator in SlotHUD |
| `itemFail` | `item_fail` | Red flash + reason text on active slot (no-ammo / cooldown) |
| `itemWhiff` | `item_whiff` | Yellow flash on active slot |

---

## AnimationState

Shared mutable object read by `IsoRenderer` each rAF frame:

```typescript
interface AnimationState {
  // Per-entity overrides (keyed by entityId)
  entityPositions: Map<string, Pos>;      // slide / lunge offsets
  entityFlashes:   Map<string, string>;   // CSS color string with alpha
  entityScales:    Map<string, number>;   // collapse / appear scale

  // World-space overlays (keyed by 'x,y')
  tileOverlays:    Map<string, string>;   // tileFlash colors
  bursts:          BurstFrame[];          // active explosion bursts
  projectiles:     ProjectileFrame[];     // active projectiles in flight

  // Phase metadata
  activePhase: Phase | null;
}
```

`IsoRenderer` checks `AnimationState` during each draw call and applies overrides on top of the base game state. When `AnimationState` is empty the renderer behaves exactly as today.

---

## Canvas rAF Loop

`IsoRenderer` gains a `startAnimating(state: RunState, animState: AnimationState, onDone: () => void)` method. It runs a `requestAnimationFrame` loop that:

1. Reads elapsed time since loop start
2. Calls `redraw(state, animState)` — same draw logic as today, with `AnimationState` overrides layered on
3. Stops when `AnimationScheduler` signals completion

The loop is dormant between turns. No rAF calls happen when nothing is animating.

---

## File Map

| Path | Action | Contents |
|------|--------|----------|
| `apps/dungeon/game/src/game/animation/animationConfig.ts` | Create | `ANIMATION_CONFIG` timing constants |
| `apps/dungeon/game/src/game/animation/eventToPhase.ts` | Create | `EVENT_PHASE` lookup table, `Phase` type |
| `apps/dungeon/game/src/game/animation/animationPrimitives.ts` | Create | Pure tween functions: slide, lunge, flash, projectile, burst, tileFlash, collapse, appear |
| `apps/dungeon/game/src/game/animation/AnimationState.ts` | Create | `AnimationState` interface + `emptyAnimationState()` factory |
| `apps/dungeon/game/src/game/animation/AnimationScheduler.ts` | Create | Phase sequencer: bucket events, fire phases with lead-time overlap, cut-and-replace, drive AnimationState mutations, emit HUD signals |
| `apps/dungeon/game/src/game/animation/AnimationScheduler.spec.ts` | Create | Vitest tests with fake timers |
| `apps/dungeon/game/src/game/animation/animationPrimitives.spec.ts` | Create | Vitest unit tests for all primitives |
| `apps/dungeon/game/src/game/animation/eventToPhase.spec.ts` | Create | Assert every GameEvent type has a mapping |
| `apps/dungeon/game/src/game/IsoRenderer.tsx` | Modify | Add `startAnimating()`, rAF loop, apply `AnimationState` overrides in draw |
| `apps/dungeon/game/src/game/SlotHUD.tsx` | Modify | Accept HUD signal props; animate slot flash, item fail, item whiff |
| `apps/dungeon/game/src/game/Game.tsx` | Modify | Wire `AnimationScheduler` into WebSocket handler; pass `onComplete` to commit React state; remove any input gating |

---

## Testing Strategy

All unit tests use vitest. No canvas or DOM required for the core logic.

**`animationPrimitives.spec.ts`**
- `slide(from, to, 0)` returns `from`; `slide(from, to, 1)` returns `to`; midpoint is interpolated correctly
- `lunge` at progress=0.5 is closer to target; at progress=1 returns origin (snap back)
- `collapse` at progress=1 returns `{ scale: 0, alpha: 0 }`
- `burst` radius grows with progress, alpha decreases

**`eventToPhase.spec.ts`**
- Every key in `GameEvent['type']` union is present in `EVENT_PHASE`
- No unknown phases returned (only `'action' | 'impact' | 'consequence' | 'cleanup' | 'skip'`)

**`AnimationScheduler.spec.ts`** (fake timers via `vi.useFakeTimers()`)
- Single-phase turn: onComplete fires after phase duration
- Multi-phase turn: impact phase fires `leadTime` ms after action phase start (not after action end)
- Cut-and-replace: calling `run()` again mid-animation cancels previous phases, onComplete from previous never fires, new onComplete fires correctly
- Empty turn (all events map to `skip`): onComplete fires immediately
- HUD signals emitted for correct events

**`IsoRenderer` / `SlotHUD` / `Game.tsx`**: integration-level, verified via existing e2e suite and manual playtesting. Canvas drawing is not unit-tested.

---

## Non-Goals (Confirmed)

- No cinematic or long-form animations
- No polished art dependency — all primitives work with shapes, colors, and alpha
- No engine changes — server-side turn resolution is untouched
- No cutscene framework
- No fast-forward / skip mode in this phase (design supports it via `progress` abstraction; implementation deferred)
