# Dungeon Animation System Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a client-side animation layer to the dungeon game that reads `turnEvents` from WebSocket turn results and drives visual feedback through the canvas renderer and HUD.

**Architecture:** A new `AnimationScheduler` buckets turn events into four overlapping phases (action → impact → consequence → cleanup), populates a shared `AnimationState` with time-stamped animation descriptors, and a `requestAnimationFrame` loop in `IsoRenderer` reads those descriptors each frame to compute visual overrides. Input is never locked; a cut-and-replace pattern handles new turns arriving mid-animation.

**Tech Stack:** React 18, TypeScript, HTML5 Canvas, Vitest 3, `vi.useFakeTimers()` for scheduler tests

---

## Key File Locations

Read these before implementing. They contain the code you will modify:

- `apps/dungeon/game/src/game/IsoRenderer.tsx` — canvas renderer (418 lines); understand `redraw()`, `drawEntity()`, `diamond()`, `drawTile()`, tile-to-screen coord formula
- `apps/dungeon/game/src/game/SlotHUD.tsx` — HUD component (91 lines)
- `apps/dungeon/game/src/game/Game.tsx` — main game component (450 lines); WebSocket handler at line 215
- `libs/dungeon/shared/src/dungeon/types.ts` — all `GameEvent` types, `RunState`, `Pos`, `Direction`, `MechanismDef`

**Tile-to-screen formula** (from IsoRenderer, line 89-93):
```typescript
const topX = offsetX + (x - y) * (tileW / 2);
const topY = offsetY + (x + y) * (tileH / 2);
const cx = topX - tileW / 2;
const cy = topY;
// where offsetX = rows * (tileW/2), offsetY = wallH
```

**`item_hit` payload:** `{ type: 'item_hit'; entityId: string; amount: number; x: number; y: number }` — `entityId` is always a string but may be empty `''`.

**`item_whiff` payload:** `{ type: 'item_whiff'; slot: Slot; itemId: string; reason: string }` — no `dir` field; correlate with the `item_activate` event in the same turn to get direction.

**`MechanismDef`:** `{ id: string; conditions: ...; effects: ...; satisfied: boolean }` — lives in `RunState.mechanisms`. To find tiles affected by a mechanism, scan `RunState.grid` for tiles where `tile.interactable?.id === mechanismId`.

---

## Chunk 1: Vitest setup + config + event-to-phase mapping

### Task 1: Add Vitest to `@org/game`

**Files:**
- Create: `apps/dungeon/game/vitest.config.mts`
- Modify: `apps/dungeon/game/package.json`

- [ ] **Step 1: Create `vitest.config.mts`**

```typescript
// apps/dungeon/game/vitest.config.mts
import { defineConfig } from 'vitest/config';
import path from 'node:path';

const root = import.meta.dirname;

export default defineConfig({
  resolve: {
    alias: {
      '@org/shared': path.resolve(root, '../../../libs/dungeon/shared/src/index.ts'),
    },
  },
  test: {
    globals: false,
    environment: 'node',
    include: ['src/**/*.spec.ts'],
  },
});
```

- [ ] **Step 2: Add test target to `package.json`**

The current `package.json` has no `nx` field. Add one:

```json
{
  "name": "@org/game",
  "version": "0.0.1",
  "private": true,
  "dependencies": {
    "react-router-dom": "^6.30.3"
  },
  "nx": {
    "targets": {
      "test": {
        "executor": "nx:run-commands",
        "options": {
          "command": "pnpm vitest run",
          "cwd": "apps/dungeon/game"
        }
      }
    }
  }
}
```

- [ ] **Step 3: Write a smoke-test to verify setup**

Create `apps/dungeon/game/src/game/animation/smoke.spec.ts`:

```typescript
import { describe, it, expect } from 'vitest';
describe('vitest setup', () => {
  it('works', () => expect(1 + 1).toBe(2));
});
```

- [ ] **Step 4: Run test — expect PASS**

```bash
pnpm nx test @org/game
```

Expected: `1 passed`

- [ ] **Step 5: Delete smoke test, commit**

```bash
rm apps/dungeon/game/src/game/animation/smoke.spec.ts
git add apps/dungeon/game/vitest.config.mts apps/dungeon/game/package.json
git commit -m "chore(dungeon-game): add vitest config and test target"
```

---

### Task 2: Animation config and event-to-phase mapping

**Files:**
- Create: `apps/dungeon/game/src/game/animation/animationConfig.ts`
- Create: `apps/dungeon/game/src/game/animation/eventToPhase.ts`
- Create: `apps/dungeon/game/src/game/animation/eventToPhase.spec.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// apps/dungeon/game/src/game/animation/eventToPhase.spec.ts
import { describe, it, expect } from 'vitest';
import { EVENT_PHASE } from './eventToPhase.js';

// All event types from GameEvent union in libs/dungeon/shared/src/dungeon/types.ts
const ALL_EVENT_TYPES = [
  'move', 'collision_attack', 'attack', 'death', 'pickup',
  'item_activate', 'item_hit', 'item_whiff', 'item_fail', 'item_interact_tile',
  'interacted', 'tile_changed', 'mechanism_solved', 'mechanism_reset',
  'fire_damage', 'fire_spread', 'explosion', 'explosion_wall_destroyed',
  'explosion_entity_damage', 'oil_ignited', 'mine_placed', 'mine_detonated',
  'slot_switched', 'room_transition', 'run_start', 'run_end', 'noop', 'player_action',
] as const;

const VALID_VALUES = ['action', 'impact', 'consequence', 'cleanup', 'skip'] as const;

describe('EVENT_PHASE', () => {
  it('has a mapping for every known event type', () => {
    for (const type of ALL_EVENT_TYPES) {
      expect(EVENT_PHASE, `missing mapping for "${type}"`).toHaveProperty(type);
    }
  });

  it('maps every event to a valid phase or skip', () => {
    for (const [type, phase] of Object.entries(EVENT_PHASE)) {
      expect(VALID_VALUES, `EVENT_PHASE["${type}"] = "${phase}" is not valid`).toContain(phase);
    }
  });
});
```

- [ ] **Step 2: Run — expect FAIL** (`Cannot find module './eventToPhase.js'`)

```bash
pnpm nx test @org/game
```

- [ ] **Step 3: Create `animationConfig.ts`**

```typescript
// apps/dungeon/game/src/game/animation/animationConfig.ts
export const ANIMATION_CONFIG = {
  phases: {
    action:      { duration: 150, leadTime:  80 },
    impact:      { duration: 180, leadTime: 100 },
    consequence: { duration: 180, leadTime: 180 },
    cleanup:     { duration:  80, leadTime:  80 },
  },
} as const;
```

- [ ] **Step 4: Create `eventToPhase.ts`**

```typescript
// apps/dungeon/game/src/game/animation/eventToPhase.ts
import type { GameEvent } from '@org/shared';

export type Phase = 'action' | 'impact' | 'consequence' | 'cleanup';
export type PhaseOrSkip = Phase | 'skip';

export const EVENT_PHASE: Record<GameEvent['type'], PhaseOrSkip> = {
  move:                     'action',
  item_activate:            'action',
  slot_switched:            'action',
  interacted:               'action',
  item_interact_tile:       'action',

  attack:                   'impact',
  collision_attack:         'impact',
  item_hit:                 'impact',
  item_whiff:               'impact',
  item_fail:                'impact',
  mine_placed:              'impact',
  mine_detonated:           'impact',
  explosion:                'impact',
  explosion_wall_destroyed: 'impact',
  explosion_entity_damage:  'impact',

  fire_damage:              'consequence',
  fire_spread:              'consequence',
  oil_ignited:              'consequence',
  tile_changed:             'consequence',
  mechanism_solved:         'consequence',
  mechanism_reset:          'consequence',
  death:                    'consequence',

  pickup:                   'cleanup',
  room_transition:          'skip',
  run_end:                  'skip',
  noop:                     'skip',
  player_action:            'skip',
  run_start:                'skip',
};
```

- [ ] **Step 5: Run — expect PASS**

```bash
pnpm nx test @org/game
```

Expected: `2 passed`

- [ ] **Step 6: Commit**

```bash
git add apps/dungeon/game/src/game/animation/
git commit -m "feat(dungeon-anim): add animation config and event-to-phase mapping"
```

---

## Chunk 2: Animation primitives and AnimationState types

### Task 3: Animation primitives

**Files:**
- Create: `apps/dungeon/game/src/game/animation/animationPrimitives.ts`
- Create: `apps/dungeon/game/src/game/animation/animationPrimitives.spec.ts`

- [ ] **Step 1: Write the failing tests**

```typescript
// apps/dungeon/game/src/game/animation/animationPrimitives.spec.ts
import { describe, it, expect } from 'vitest';
import {
  slide, lunge, flash, missIndicator, burst, tileFlash, collapse, appear, projectile,
} from './animationPrimitives.js';

function parseAlpha(rgba: string): number {
  const m = rgba.match(/rgba\(\d+,\d+,\d+,([\d.]+)\)/);
  return m ? parseFloat(m[1]) : -1;
}

describe('slide', () => {
  it('returns from at progress=0', () => {
    expect(slide({ x: 0, y: 0 }, { x: 4, y: 2 }, 0)).toEqual({ x: 0, y: 0 });
  });
  it('returns to at progress=1', () => {
    expect(slide({ x: 0, y: 0 }, { x: 4, y: 2 }, 1)).toEqual({ x: 4, y: 2 });
  });
  it('returns midpoint at progress=0.5', () => {
    expect(slide({ x: 0, y: 0 }, { x: 4, y: 2 }, 0.5)).toEqual({ x: 2, y: 1 });
  });
});

describe('lunge', () => {
  const origin = { x: 0, y: 0 };
  const toward = { x: 4, y: 0 };
  it('stays at origin at progress=0', () => {
    const r = lunge(origin, toward, 0);
    expect(r.x).toBeCloseTo(0);
  });
  it('is 30% toward target at progress=0.5 (peak extend)', () => {
    const r = lunge(origin, toward, 0.5);
    expect(r.x).toBeCloseTo(1.2); // 4 * 0.3
  });
  it('returns to origin at progress=1', () => {
    const r = lunge(origin, toward, 1);
    expect(r.x).toBeCloseTo(0);
  });
});

describe('flash', () => {
  it('full alpha at progress=0', () => {
    expect(parseAlpha(flash('255,0,0', 0))).toBeCloseTo(1);
  });
  it('zero alpha at progress=1', () => {
    expect(parseAlpha(flash('255,0,0', 1))).toBeCloseTo(0);
  });
  it('alpha decreases as progress increases', () => {
    expect(parseAlpha(flash('255,0,0', 0.3))).toBeGreaterThan(
      parseAlpha(flash('255,0,0', 0.7)),
    );
  });
});

describe('missIndicator', () => {
  it('alpha is ~1 at progress=0.2 (peak)', () => {
    expect(missIndicator(0.2).alpha).toBeCloseTo(1);
  });
  it('alpha is 0 at progress=1', () => {
    expect(missIndicator(1).alpha).toBeCloseTo(0);
  });
  it('alpha at 0.6 is less than at 0.1', () => {
    expect(missIndicator(0.6).alpha).toBeLessThan(missIndicator(0.1).alpha);
  });
});

describe('burst', () => {
  it('radiusPx is 0 at progress=0', () => {
    expect(burst(100, 0).radiusPx).toBe(0);
  });
  it('radiusPx reaches tileRadiusPx at progress=1', () => {
    expect(burst(100, 1).radiusPx).toBe(100);
  });
  it('alpha starts at 1, ends at 0', () => {
    expect(burst(100, 0).alpha).toBe(1);
    expect(burst(100, 1).alpha).toBe(0);
  });
  it('radius at 0.5 is greater than at 0.25', () => {
    expect(burst(100, 0.5).radiusPx).toBeGreaterThan(burst(100, 0.25).radiusPx);
  });
});

describe('tileFlash', () => {
  it('alpha at progress=0 equals peakAlpha', () => {
    expect(parseAlpha(tileFlash('255,255,255', 0, 0.7))).toBeCloseTo(0.7);
  });
  it('alpha at progress=1 is 0', () => {
    expect(parseAlpha(tileFlash('255,255,255', 1, 0.7))).toBeCloseTo(0);
  });
});

describe('collapse', () => {
  it('scale=1, alpha=1 at progress=0', () => {
    expect(collapse(0)).toEqual({ scale: 1, alpha: 1 });
  });
  it('scale=0, alpha=0 at progress=1', () => {
    expect(collapse(1)).toEqual({ scale: 0, alpha: 0 });
  });
});

describe('appear', () => {
  it('scale=0 at progress=0', () => {
    expect(appear(0)).toEqual({ scale: 0 });
  });
  it('scale=1 at progress=1', () => {
    expect(appear(1)).toEqual({ scale: 1 });
  });
});

describe('projectile', () => {
  it('returns from at progress=0', () => {
    expect(projectile({ x: 0, y: 0 }, { x: 4, y: 0 }, 0)).toEqual({ x: 0, y: 0 });
  });
  it('returns to at progress=1', () => {
    expect(projectile({ x: 0, y: 0 }, { x: 4, y: 0 }, 1)).toEqual({ x: 4, y: 0 });
  });
  it('returns midpoint at progress=0.5', () => {
    expect(projectile({ x: 0, y: 0 }, { x: 4, y: 0 }, 0.5)).toEqual({ x: 2, y: 0 });
  });
});
```

- [ ] **Step 2: Run — expect FAIL**

```bash
pnpm nx test @org/game
```

- [ ] **Step 3: Create `animationPrimitives.ts`**

```typescript
// apps/dungeon/game/src/game/animation/animationPrimitives.ts
import type { Pos } from '@org/shared';

/** Linear interpolation between two tile positions. */
export function slide(from: Pos, to: Pos, progress: number): Pos {
  return {
    x: from.x + (to.x - from.x) * progress,
    y: from.y + (to.y - from.y) * progress,
  };
}

/**
 * Nudge attacker 30% toward target then snap back.
 * progress 0→0.5 = extend; 0.5→1 = retract.
 */
export function lunge(origin: Pos, toward: Pos, progress: number): Pos {
  const t = progress < 0.5 ? progress * 2 : (1 - progress) * 2;
  const amount = 0.3 * t;
  return {
    x: origin.x + (toward.x - origin.x) * amount,
    y: origin.y + (toward.y - origin.y) * amount,
  };
}

/**
 * Returns a CSS rgba string for an entity flash overlay.
 * rgbColor e.g. '255,0,0'. Alpha fades from 1 → 0.
 */
export function flash(rgbColor: string, progress: number): string {
  const alpha = Math.max(0, 1 - progress);
  return `rgba(${rgbColor},${alpha.toFixed(2)})`;
}

/**
 * Miss indicator alpha: ramps up quickly to peak at progress=0.2, then fades.
 */
export function missIndicator(progress: number): { alpha: number } {
  const alpha = progress < 0.2
    ? progress / 0.2
    : Math.max(0, 1 - (progress - 0.2) / 0.8);
  return { alpha };
}

export interface BurstFrame {
  radiusPx: number;
  alpha: number;
}

/**
 * Expanding circle with fade. tileRadiusPx = max pixel radius.
 */
export function burst(tileRadiusPx: number, progress: number): BurstFrame {
  return {
    radiusPx: tileRadiusPx * progress,
    alpha: Math.max(0, 1 - progress),
  };
}

/**
 * Tile color overlay. rgbColor e.g. '255,255,0'. Fades from peakAlpha → 0.
 */
export function tileFlash(rgbColor: string, progress: number, peakAlpha = 0.7): string {
  const alpha = Math.max(0, peakAlpha * (1 - progress));
  return `rgba(${rgbColor},${alpha.toFixed(2)})`;
}

/** Entity shrinks and fades to zero. */
export function collapse(progress: number): { scale: number; alpha: number } {
  return { scale: 1 - progress, alpha: 1 - progress };
}

/** Board object scales up from 0. */
export function appear(progress: number): { scale: number } {
  return { scale: progress };
}

/** Traveling projectile: simple linear interpolation between two tile positions. */
export function projectile(from: Pos, to: Pos, progress: number): Pos {
  return {
    x: from.x + (to.x - from.x) * progress,
    y: from.y + (to.y - from.y) * progress,
  };
}
```

- [ ] **Step 4: Run — expect PASS**

```bash
pnpm nx test @org/game
```

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add apps/dungeon/game/src/game/animation/
git commit -m "feat(dungeon-anim): add animation primitives with full test coverage"
```

---

### Task 4: AnimationState types

**Files:**
- Create: `apps/dungeon/game/src/game/animation/AnimationState.ts`

No unit tests needed — pure type definitions and a factory. Correctness verified in AnimationScheduler tests.

> **Phase 1 scope note:** The `appear` primitive exists in `animationPrimitives.ts` and is tested there. However, rendering `appear` for board objects (e.g. mine placement) via a dedicated `EntityAppearAnim` array in `AnimationState` is **deferred to Phase 2**. In Phase 1, `mine_placed` uses only a `tileFlash` to indicate placement. The `appear` type and renderer code are not added here.

- [ ] **Step 1: Create `AnimationState.ts`**

```typescript
// apps/dungeon/game/src/game/animation/AnimationState.ts
import type { Pos } from '@org/shared';
import type { Phase } from './eventToPhase.js';

/** Entity sliding or lunging between tile positions. */
export interface EntityPositionAnim {
  entityId: string;
  kind: 'slide' | 'lunge';
  from: Pos;
  to: Pos;
  startTime: number;  // performance.now() when this anim started
  duration: number;   // ms
}

/** Color flash overlay on an entity. */
export interface EntityFlashAnim {
  entityId: string;
  rgbColor: string;   // e.g. '220,50,50'
  startTime: number;
  duration: number;
}

/** Entity scaling (collapse for death). */
export interface EntityScaleAnim {
  entityId: string;
  kind: 'collapse';
  startTime: number;
  duration: number;
}

/** Tile color overlay. */
export interface TileFlashAnim {
  key: string;        // 'x,y'
  rgbColor: string;
  peakAlpha?: number; // default 0.7
  startTime: number;
  duration: number;
}

/** Expanding burst circle (explosion, mine detonation). */
export interface BurstAnim {
  x: number;
  y: number;
  tileRadiusPx: number;
  startTime: number;
  duration: number;
}

/** Traveling projectile between two tile positions. */
export interface ProjectileAnim {
  from: Pos;
  to: Pos;
  startTime: number;
  duration: number;
}

/** Miss indicator at a tile (X mark / fade). */
export interface MissAnim {
  at: Pos;
  startTime: number;
  duration: number;
}

export interface AnimationState {
  entityPositions: EntityPositionAnim[];
  entityFlashes:   EntityFlashAnim[];
  entityScales:    EntityScaleAnim[];
  tileFlashes:     TileFlashAnim[];
  bursts:          BurstAnim[];
  projectiles:     ProjectileAnim[];
  missIndicators:  MissAnim[];
  activePhase:     Phase | null;
  done:            boolean;
}

export function emptyAnimationState(): AnimationState {
  return {
    entityPositions: [],
    entityFlashes:   [],
    entityScales:    [],
    tileFlashes:     [],
    bursts:          [],
    projectiles:     [],
    missIndicators:  [],
    activePhase:     null,
    done:            false,
  };
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/dungeon/game/src/game/animation/AnimationState.ts
git commit -m "feat(dungeon-anim): add AnimationState types and factory"
```

---

## Chunk 3: AnimationScheduler

### Task 5: AnimationScheduler

**Files:**
- Create: `apps/dungeon/game/src/game/animation/AnimationScheduler.ts`
- Create: `apps/dungeon/game/src/game/animation/AnimationScheduler.spec.ts`

- [ ] **Step 1: Write all failing tests**

```typescript
// apps/dungeon/game/src/game/animation/AnimationScheduler.spec.ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { AnimationScheduler } from './AnimationScheduler.js';
import { emptyAnimationState } from './AnimationState.js';
import type { GameEvent, RunState } from '@org/shared';

// Minimal RunState for testing
// Entity requires `kind` and `state` fields — check libs/dungeon/shared/src/dungeon/types.ts for the full type
function mockState(overrides: Partial<{ enemyPos: { id: string; pos: { x: number; y: number } } }> = {}): RunState {
  const enemies = overrides.enemyPos
    ? [{ id: overrides.enemyPos.id, pos: overrides.enemyPos.pos, hp: 5, maxHp: 5, attackDamage: 1, aiType: 'chase_astar', kind: 'enemy', state: 'active' }]
    : [];
  return {
    player: { id: 'player', pos: { x: 2, y: 2 }, hp: 10, maxHp: 10, attackDamage: 2, aiType: 'chase_astar', kind: 'player', state: 'active' },
    enemies,
    grid: [],
    mechanisms: [],
    id: 'run1',
    currentRoomId: 'r1',
    rooms: {},
    overclock: 1,
    events: [],
    status: 'active',
    config: {} as any,
    pendingExplosions: [],
    profile: {} as any,
    runItemState: {} as any,
    startReceipt: {} as any,
  } as unknown as RunState;
}

function ev<T extends GameEvent['type']>(
  type: T,
  extra: Omit<Extract<GameEvent, { type: T }>, 'type'>,
): Extract<GameEvent, { type: T }> {
  return { type, ...extra } as Extract<GameEvent, { type: T }>;
}

describe('AnimationScheduler', () => {
  let scheduler: AnimationScheduler;

  beforeEach(() => {
    vi.useFakeTimers();
    scheduler = new AnimationScheduler();
  });

  afterEach(() => {
    scheduler.cancel();
    vi.useRealTimers();
  });

  it('calls onComplete immediately when all events map to skip', () => {
    const animState = emptyAnimationState();
    const onComplete = vi.fn();
    scheduler.run(
      [ev('noop', { reason: 'nothing' })],
      animState, mockState(), onComplete, vi.fn(),
    );
    expect(onComplete).toHaveBeenCalledOnce();
    expect(animState.done).toBe(true);
  });

  it('calls onComplete after action duration for a move-only turn', () => {
    const animState = emptyAnimationState();
    const onComplete = vi.fn();
    scheduler.run(
      [ev('move', { entityId: 'player', from: { x: 1, y: 1 }, to: { x: 2, y: 1 } })],
      animState, mockState(), onComplete, vi.fn(),
    );
    expect(onComplete).not.toHaveBeenCalled();
    vi.advanceTimersByTime(150); // action duration
    expect(onComplete).toHaveBeenCalledOnce();
  });

  it('impact phase starts after action leadTime (80ms), not after action duration (150ms)', () => {
    const animState = emptyAnimationState();
    scheduler.run(
      [
        ev('move', { entityId: 'player', from: { x: 1, y: 1 }, to: { x: 2, y: 1 } }),
        ev('attack', { attackerId: 'player', targetId: 'e1', damage: 3 }),
      ],
      animState,
      mockState({ enemyPos: { id: 'e1', pos: { x: 3, y: 1 } } }),
      vi.fn(), vi.fn(),
    );
    expect(animState.activePhase).toBe('action');
    vi.advanceTimersByTime(79);
    expect(animState.activePhase).toBe('action'); // not yet
    vi.advanceTimersByTime(1);
    expect(animState.activePhase).toBe('impact'); // leadTime of action = 80ms
  });

  it('onComplete fires only after the last phase ends (action + consequence turn)', () => {
    // action leadTime=80, consequence starts at 80ms, duration=180ms → ends at 260ms
    const animState = emptyAnimationState();
    const onComplete = vi.fn();
    scheduler.run(
      [
        ev('move', { entityId: 'player', from: { x: 1, y: 1 }, to: { x: 2, y: 1 } }),
        ev('death', { entityId: 'e1' }),
      ],
      animState, mockState(), onComplete, vi.fn(),
    );
    vi.advanceTimersByTime(259);
    expect(onComplete).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(onComplete).toHaveBeenCalledOnce();
  });

  it('cut-and-replace: first onComplete never fires after run() is called again', () => {
    const animState1 = emptyAnimationState();
    const onComplete1 = vi.fn();
    scheduler.run(
      [ev('move', { entityId: 'player', from: { x: 1, y: 1 }, to: { x: 2, y: 1 } })],
      animState1, mockState(), onComplete1, vi.fn(),
    );
    vi.advanceTimersByTime(50); // mid-animation

    const animState2 = emptyAnimationState();
    const onComplete2 = vi.fn();
    scheduler.run(
      [ev('move', { entityId: 'player', from: { x: 2, y: 1 }, to: { x: 3, y: 1 } })],
      animState2, mockState(), onComplete2, vi.fn(),
    );

    vi.advanceTimersByTime(500);
    expect(onComplete1).not.toHaveBeenCalled();
    expect(onComplete2).toHaveBeenCalledOnce();
  });

  it('instant option: onComplete called synchronously, done=true immediately', () => {
    const animState = emptyAnimationState();
    const onComplete = vi.fn();
    scheduler.run(
      [ev('move', { entityId: 'player', from: { x: 1, y: 1 }, to: { x: 2, y: 1 } })],
      animState, mockState(), onComplete, vi.fn(), { instant: true },
    );
    expect(onComplete).toHaveBeenCalledOnce();
    expect(animState.done).toBe(true);
  });

  it('emits slotFlash for slot_switched', () => {
    const onHud = vi.fn();
    scheduler.run(
      [ev('slot_switched', { slot: 'B' })],
      emptyAnimationState(), mockState(), vi.fn(), onHud,
    );
    expect(onHud).toHaveBeenCalledWith({ type: 'slotFlash' });
  });

  it('emits itemFail with reason for item_fail', () => {
    const onHud = vi.fn();
    scheduler.run(
      [ev('item_fail', { slot: 'A', itemId: 'hammer', reason: 'no-ammo' })],
      emptyAnimationState(), mockState(), vi.fn(), onHud,
    );
    expect(onHud).toHaveBeenCalledWith({ type: 'itemFail', reason: 'no-ammo' });
  });

  it('emits itemWhiff for item_whiff', () => {
    const onHud = vi.fn();
    scheduler.run(
      [ev('item_whiff', { slot: 'A', itemId: 'rivet_gun', reason: 'blocked' })],
      emptyAnimationState(), mockState(), vi.fn(), onHud,
    );
    expect(onHud).toHaveBeenCalledWith({ type: 'itemWhiff' });
  });

  it('item_activate + item_hit → produces projectile (ranged)', () => {
    const animState = emptyAnimationState();
    scheduler.run(
      [
        ev('item_activate', { slot: 'A', itemId: 'rivet_gun', dir: 'E' }),
        ev('item_hit', { entityId: 'e1', amount: 5, x: 4, y: 2 }),
      ],
      animState, mockState(), vi.fn(), vi.fn(),
    );
    expect(animState.projectiles).toHaveLength(1);
    expect(animState.entityPositions.some(p => p.kind === 'lunge')).toBe(false);
  });

  it('item_activate alone → produces player lunge (melee)', () => {
    const animState = emptyAnimationState();
    scheduler.run(
      [ev('item_activate', { slot: 'A', itemId: 'hammer', dir: 'N' })],
      animState, mockState(), vi.fn(), vi.fn(),
    );
    expect(animState.entityPositions.some(p => p.kind === 'lunge')).toBe(true);
    expect(animState.projectiles).toHaveLength(0);
  });

  it('item_hit with non-empty entityId flashes entity, not tile', () => {
    const animState = emptyAnimationState();
    scheduler.run(
      [ev('item_hit', { entityId: 'e1', amount: 5, x: 3, y: 2 })],
      animState, mockState(), vi.fn(), vi.fn(),
    );
    expect(animState.entityFlashes.some(f => f.entityId === 'e1')).toBe(true);
    expect(animState.tileFlashes).toHaveLength(0);
  });

  it('item_hit with empty entityId flashes tile at (x,y)', () => {
    const animState = emptyAnimationState();
    scheduler.run(
      [ev('item_hit', { entityId: '', amount: 5, x: 3, y: 2 })],
      animState, mockState(), vi.fn(), vi.fn(),
    );
    expect(animState.tileFlashes.some(t => t.key === '3,2')).toBe(true);
    expect(animState.entityFlashes).toHaveLength(0);
  });

  it('attack produces lunge on attacker and flash on target', () => {
    const animState = emptyAnimationState();
    scheduler.run(
      [ev('attack', { attackerId: 'player', targetId: 'e1', damage: 3 })],
      animState,
      mockState({ enemyPos: { id: 'e1', pos: { x: 3, y: 2 } } }),
      vi.fn(), vi.fn(),
    );
    expect(animState.entityPositions.some(p => p.entityId === 'player' && p.kind === 'lunge')).toBe(true);
    expect(animState.entityFlashes.some(f => f.entityId === 'e1')).toBe(true);
  });

  it('death produces collapse scale anim on the dying entity', () => {
    const animState = emptyAnimationState();
    scheduler.run(
      [ev('death', { entityId: 'e1' })],
      animState, mockState(), vi.fn(), vi.fn(),
    );
    expect(animState.entityScales.some(s => s.entityId === 'e1' && s.kind === 'collapse')).toBe(true);
  });

  it('explosion produces a burst anim', () => {
    const animState = emptyAnimationState();
    scheduler.run(
      [ev('explosion', { x: 3, y: 3, radius: 2 })],
      animState, mockState(), vi.fn(), vi.fn(),
    );
    expect(animState.bursts).toHaveLength(1);
    expect(animState.bursts[0].x).toBe(3);
    expect(animState.bursts[0].y).toBe(3);
  });
});
```

- [ ] **Step 2: Run — expect FAIL**

```bash
pnpm nx test @org/game
```

- [ ] **Step 3: Create `AnimationScheduler.ts`**

```typescript
// apps/dungeon/game/src/game/animation/AnimationScheduler.ts
import type { GameEvent, RunState, Pos } from '@org/shared';
import { ANIMATION_CONFIG } from './animationConfig.js';
import { EVENT_PHASE, type Phase } from './eventToPhase.js';
import type { AnimationState } from './AnimationState.js';

export type HudSignal =
  | { type: 'slotFlash' }
  | { type: 'itemFail'; reason: string }
  | { type: 'itemWhiff' };

export type HudSignalHandler = (signal: HudSignal) => void;

export interface RunOptions {
  instant?: boolean;
}

const DIR_DELTA: Record<string, Pos> = {
  N: { x: 0, y: -1 },
  S: { x: 0, y: 1 },
  E: { x: 1, y: 0 },
  W: { x: -1, y: 0 },
};

const PHASES: Phase[] = ['action', 'impact', 'consequence', 'cleanup'];

export class AnimationScheduler {
  private timeouts: ReturnType<typeof setTimeout>[] = [];

  run(
    events: GameEvent[],
    animState: AnimationState,
    runState: RunState,
    onComplete: () => void,
    onHudSignal: HudSignalHandler,
    options?: RunOptions,
  ): void {
    this.cancel();

    if (options?.instant) {
      animState.done = true;
      onComplete();
      return;
    }

    // Emit HUD signals immediately (always, regardless of phase timing)
    for (const event of events) {
      if (event.type === 'slot_switched') onHudSignal({ type: 'slotFlash' });
      if (event.type === 'item_fail')     onHudSignal({ type: 'itemFail', reason: event.reason });
      if (event.type === 'item_whiff')    onHudSignal({ type: 'itemWhiff' });
    }

    // Bucket events by phase
    const byPhase = new Map<Phase, GameEvent[]>(PHASES.map(p => [p, []]));
    for (const event of events) {
      const p = EVENT_PHASE[event.type];
      if (p !== 'skip') byPhase.get(p)!.push(event);
    }

    const hasEvents = PHASES.some(p => byPhase.get(p)!.length > 0);
    if (!hasEvents) {
      animState.done = true;
      onComplete();
      return;
    }

    // Schedule phases with lead-time overlap
    let cumulativeDelay = 0;
    let lastEndTime = 0;

    for (const phase of PHASES) {
      const phaseEvents = byPhase.get(phase)!;
      if (phaseEvents.length === 0) continue;

      const { duration, leadTime } = ANIMATION_CONFIG.phases[phase];
      const startDelay = cumulativeDelay;
      lastEndTime = startDelay + duration;

      const delay = startDelay;
      this.timeouts.push(setTimeout(() => {
        animState.activePhase = phase;
        this.applyPhase(phase, phaseEvents, animState, runState, events, performance.now(), duration);
      }, delay));

      cumulativeDelay += leadTime;
    }

    // Mark done after the last phase's duration expires
    this.timeouts.push(setTimeout(() => {
      animState.done = true;
      onComplete();
    }, lastEndTime));
  }

  cancel(): void {
    for (const t of this.timeouts) clearTimeout(t);
    this.timeouts = [];
  }

  private applyPhase(
    _phase: Phase,
    events: GameEvent[],
    animState: AnimationState,
    runState: RunState,
    allEvents: GameEvent[],
    now: number,
    duration: number,
  ): void {
    const player = runState.player;
    const isRangedActivate = allEvents.some(e => e.type === 'item_hit' || e.type === 'item_whiff');

    for (const event of events) {
      switch (event.type) {
        case 'move': {
          animState.entityPositions.push({
            entityId: event.entityId, kind: 'slide',
            from: event.from, to: event.to, startTime: now, duration,
          });
          break;
        }

        case 'attack':
        case 'collision_attack': {
          const targetPos = findPos(event.targetId, runState);
          const attackerPos = findPos(event.attackerId, runState) ?? player.pos;
          if (targetPos) {
            animState.entityPositions.push({
              entityId: event.attackerId, kind: 'lunge',
              from: attackerPos, to: targetPos, startTime: now, duration,
            });
          }
          animState.entityFlashes.push({
            entityId: event.targetId, rgbColor: '220,50,50',
            startTime: now, duration,
          });
          break;
        }

        case 'item_activate': {
          const delta = DIR_DELTA[event.dir] ?? { x: 0, y: 0 };
          const from = player.pos;
          if (isRangedActivate) {
            // Projectile travels 4 tiles in the given direction
            const to: Pos = { x: from.x + delta.x * 4, y: from.y + delta.y * 4 };
            animState.projectiles.push({ from, to, startTime: now, duration });
          } else {
            const to: Pos = { x: from.x + delta.x, y: from.y + delta.y };
            animState.entityPositions.push({
              entityId: player.id, kind: 'lunge',
              from, to, startTime: now, duration,
            });
          }
          break;
        }

        case 'item_hit': {
          if (event.entityId) {
            animState.entityFlashes.push({
              entityId: event.entityId, rgbColor: '220,140,50',
              startTime: now, duration,
            });
          } else {
            animState.tileFlashes.push({
              key: `${event.x},${event.y}`, rgbColor: '220,140,50',
              startTime: now, duration,
            });
          }
          break;
        }

        case 'item_whiff': {
          const activateEv = allEvents.find(
            (e): e is Extract<GameEvent, { type: 'item_activate' }> => e.type === 'item_activate',
          );
          if (activateEv) {
            const delta = DIR_DELTA[activateEv.dir] ?? { x: 0, y: 0 };
            const at: Pos = { x: player.pos.x + delta.x, y: player.pos.y + delta.y };
            animState.missIndicators.push({ at, startTime: now, duration });
          }
          break;
        }

        case 'mine_placed': {
          animState.tileFlashes.push({
            key: `${event.x},${event.y}`, rgbColor: '220,220,50',
            peakAlpha: 0.85, startTime: now, duration,
          });
          break;
        }

        case 'mine_detonated': {
          animState.bursts.push({
            x: event.x, y: event.y, tileRadiusPx: 48,
            startTime: now, duration,
          });
          break;
        }

        case 'explosion': {
          animState.bursts.push({
            x: event.x, y: event.y, tileRadiusPx: event.radius * 32,
            startTime: now, duration,
          });
          break;
        }

        case 'explosion_wall_destroyed': {
          animState.tileFlashes.push({
            key: `${event.x},${event.y}`, rgbColor: '255,255,255',
            peakAlpha: 0.9, startTime: now, duration,
          });
          break;
        }

        case 'explosion_entity_damage': {
          animState.entityFlashes.push({
            entityId: event.entityId, rgbColor: '220,140,50',
            startTime: now, duration,
          });
          break;
        }

        case 'fire_damage': {
          animState.entityFlashes.push({
            entityId: event.entityId, rgbColor: '220,80,30',
            startTime: now, duration,
          });
          break;
        }

        case 'fire_spread': {
          animState.tileFlashes.push({
            key: `${event.toX},${event.toY}`, rgbColor: '220,100,30',
            startTime: now, duration,
          });
          break;
        }

        case 'oil_ignited': {
          animState.tileFlashes.push({
            key: `${event.x},${event.y}`, rgbColor: '255,160,0',
            peakAlpha: 0.9, startTime: now, duration,
          });
          break;
        }

        case 'tile_changed': {
          animState.tileFlashes.push({
            key: `${event.x},${event.y}`, rgbColor: '255,255,255',
            peakAlpha: 0.6, startTime: now, duration,
          });
          break;
        }

        case 'mechanism_solved': {
          for (const pos of findMechanismTiles(event.mechanismId, runState)) {
            animState.tileFlashes.push({
              key: `${pos.x},${pos.y}`, rgbColor: '0,220,220',
              startTime: now, duration,
            });
          }
          break;
        }

        case 'mechanism_reset': {
          for (const pos of findMechanismTiles(event.mechanismId, runState)) {
            animState.tileFlashes.push({
              key: `${pos.x},${pos.y}`, rgbColor: '150,150,150',
              startTime: now, duration,
            });
          }
          break;
        }

        case 'interacted': {
          const pos = findInteractableTile(event.interactableId, runState);
          if (pos) {
            animState.tileFlashes.push({
              key: `${pos.x},${pos.y}`, rgbColor: '50,100,220',
              startTime: now, duration,
            });
          }
          break;
        }

        case 'death': {
          animState.entityScales.push({
            entityId: event.entityId, kind: 'collapse',
            startTime: now, duration,
          });
          break;
        }
      }
    }
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function findPos(entityId: string, runState: RunState): Pos | undefined {
  if (entityId === 'player' || entityId === runState.player.id) return runState.player.pos;
  return runState.enemies.find(e => e.id === entityId)?.pos;
}

function findMechanismTiles(mechanismId: string, runState: RunState): Pos[] {
  const result: Pos[] = [];
  for (let y = 0; y < runState.grid.length; y++) {
    for (let x = 0; x < runState.grid[y].length; x++) {
      if (runState.grid[y][x].interactable?.id === mechanismId) {
        result.push({ x, y });
      }
    }
  }
  return result;
}

function findInteractableTile(interactableId: string, runState: RunState): Pos | undefined {
  for (let y = 0; y < runState.grid.length; y++) {
    for (let x = 0; x < runState.grid[y].length; x++) {
      if (runState.grid[y][x].interactable?.id === interactableId) return { x, y };
    }
  }
  return undefined;
}
```

- [ ] **Step 4: Run — expect PASS**

```bash
pnpm nx test @org/game
```

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add apps/dungeon/game/src/game/animation/
git commit -m "feat(dungeon-anim): add AnimationScheduler with phase sequencing and full test coverage"
```

---

## Chunk 4: IsoRenderer rAF loop

### Task 6: IsoRenderer — forwardRef + rAF + AnimationState overlays

**Files:**
- Modify: `apps/dungeon/game/src/game/IsoRenderer.tsx`

Read the full file before editing (`apps/dungeon/game/src/game/IsoRenderer.tsx`).

Key changes:
1. Convert from a plain function component to `forwardRef`
2. Expose `IsoRendererHandle` with `startAnimating(animState, onDone)` and `cancelAnimation()`
3. Extract `redraw()` so it can accept an optional `AnimationState` and `now: number`
4. In the rAF loop, compute progress for each anim descriptor and draw overlays

**Tile-to-screen helper** (add near top of file, inside component or as a module-level helper):
```typescript
function tileToScreen(
  pos: { x: number; y: number },
  offsetX: number, offsetY: number,
  tileW: number, tileH: number,
): { cx: number; cy: number } {
  const topX = offsetX + (pos.x - pos.y) * (tileW / 2);
  const topY = offsetY + (pos.x + pos.y) * (tileH / 2);
  return { cx: topX - tileW / 2, cy: topY };
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}
```

- [ ] **Step 1: Add imports and types at top of `IsoRenderer.tsx`**

Add after existing imports:
```typescript
import { forwardRef, useImperativeHandle } from 'react';
import type { AnimationState } from './animation/AnimationState.js';
import { slide, lunge, flash, burst, tileFlash, collapse, missIndicator, projectile } from './animation/animationPrimitives.js';

export interface IsoRendererHandle {
  startAnimating(animState: AnimationState, onDone: () => void): void;
  cancelAnimation(): void;
}
```

- [ ] **Step 2: Convert component to `forwardRef`**

Change the function signature from:
```typescript
export function IsoRenderer({ grid, player, enemies, tileset, highlightedCells }: IsoRendererProps) {
```
To:
```typescript
export const IsoRenderer = forwardRef<IsoRendererHandle, IsoRendererProps>(
  function IsoRenderer({ grid, player, enemies, tileset, highlightedCells }, ref) {
```
And close the extra parens/brace at the end of the component.

- [ ] **Step 3: Add rAF refs inside the component**

Add these refs inside the component body, after the existing refs:
```typescript
const rafRef = useRef<number | null>(null);
const animStateRef = useRef<AnimationState | null>(null);
const onDoneRef = useRef<(() => void) | null>(null);
```

- [ ] **Step 4: Add `useImperativeHandle`**

Add inside the component body (after refs, before the sprite-load `useEffect`):

```typescript
useImperativeHandle(ref, () => ({
  startAnimating(animState, onDone) {
    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    animStateRef.current = animState;
    onDoneRef.current = onDone;

    function loop() {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      redrawWithAnim(ctx, animStateRef.current);
      if (!animStateRef.current?.done) {
        rafRef.current = requestAnimationFrame(loop);
      } else {
        rafRef.current = null;
        animStateRef.current = null;
        onDoneRef.current?.();
      }
    }
    rafRef.current = requestAnimationFrame(loop);
  },
  cancelAnimation() {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    animStateRef.current = null;
  },
}));
```

- [ ] **Step 5: Extract `redrawWithAnim` function**

Inside the drawing `useEffect`, the existing `redraw()` function needs to be extractable. Refactor so `redraw()` calls a new `redrawWithAnim(ctx, animState?)` function.

Replace the existing `redraw()` function inside the `useEffect` with:

```typescript
function redrawWithAnim(ctx: CanvasRenderingContext2D, animState?: AnimationState | null) {
  ctx.clearRect(0, 0, canvas!.width, canvas!.height);
  const now = performance.now();

  // ── Build position overrides from animState ──────────────────────────────
  const posOverride = new Map<string, { x: number; y: number }>();
  const flashOverride = new Map<string, string>(); // entityId → rgba color
  const scaleOverride = new Map<string, number>(); // entityId → scale (0-1)

  if (animState) {
    for (const anim of animState.entityPositions) {
      const p = clamp((now - anim.startTime) / anim.duration, 0, 1);
      const pos = anim.kind === 'slide'
        ? slide(anim.from, anim.to, p)
        : lunge(anim.from, anim.to, p);
      posOverride.set(anim.entityId, pos);
    }
    for (const anim of animState.entityFlashes) {
      const p = clamp((now - anim.startTime) / anim.duration, 0, 1);
      flashOverride.set(anim.entityId, flash(anim.rgbColor, p));
    }
    for (const anim of animState.entityScales) {
      const p = clamp((now - anim.startTime) / anim.duration, 0, 1);
      scaleOverride.set(anim.entityId, collapse(p).scale);
    }
  }

  // ── Separate animated vs static entities ────────────────────────────────
  // IsoRenderer receives player/enemies as props (no full RunState).
  // Animated entities are drawn after the painter's-algorithm loop at their
  // fractional tile position; static entities go into the tile-key lookup.
  const highlightAt = new Map<string, boolean>();
  for (const cell of highlightedCells ?? []) {
    highlightAt.set(`${cell.x},${cell.y}`, cell.valid);
  }

  type EntityRole = 'player' | 'chase' | 'patrol' | 'charger';
  const staticEntityAt = new Map<string, EntityRole>();
  const animatedEntities: Array<{ role: EntityRole; pos: { x: number; y: number }; id: string }> = [];

  // Player
  const playerAnimatedPos = posOverride.get('player');
  if (playerAnimatedPos) {
    animatedEntities.push({ role: 'player', pos: playerAnimatedPos, id: 'player' });
  } else {
    staticEntityAt.set(`${player.pos.x},${player.pos.y}`, 'player');
  }

  // Enemies
  for (const e of enemies) {
    const role: EntityRole =
      e.aiType === 'patrol_loop' ? 'patrol'
      : e.aiType === 'charger'   ? 'charger'
      : 'chase';
    const enemyAnimPos = posOverride.get(e.id);
    if (enemyAnimPos) {
      animatedEntities.push({ role, pos: enemyAnimPos, id: e.id });
    } else {
      staticEntityAt.set(`${e.pos.x},${e.pos.y}`, role);
    }
  }

// ── Painter's algorithm (static entities only) ──────────────────────────────
for (let d = 0; d < rows + cols - 1; d++) {
  for (let x = 0; x < cols; x++) {
    const y = d - x;
    if (y < 0 || y >= rows) continue;

    const tile = grid[y][x];
    const topX = offsetX + (x - y) * (tileW / 2);
    const topY = offsetY + (x + y) * (tileH / 2);
    const cx = topX - tileW / 2;
    const cy = topY;

    drawTile(ctx, cx, cy, tile, tileset, sheetReadyRef.current ? sheetRef.current : null);

    // Highlight
    const hlValid = highlightAt.get(`${x},${y}`);
    if (hlValid !== undefined) {
      ctx.fillStyle = hlValid ? 'rgba(255, 220, 50, 0.4)' : 'rgba(160, 160, 160, 0.4)';
      diamond(ctx, cx, cy, tileW, tileH);
      ctx.fill();
    }

    // Tile flash overlay
    if (animState) {
      const tf = animState.tileFlashes.find(t => t.key === `${x},${y}`);
      if (tf) {
        const p = clamp((now - tf.startTime) / tf.duration, 0, 1);
        ctx.fillStyle = tileFlash(tf.rgbColor, p, tf.peakAlpha);
        diamond(ctx, cx, cy, tileW, tileH);
        ctx.fill();
      }
    }

    // Static entity
    const role = staticEntityAt.get(`${x},${y}`);
    if (role) {
      const entityId = role === 'player' ? 'player' : enemies.find(e => e.pos.x === x && e.pos.y === y)?.id ?? '';
      const sc = scaleOverride.get(entityId) ?? 1;
      const fl = flashOverride.get(entityId);
      drawEntityWithOverrides(ctx, cx, cy, role, tileset, sc, fl);
    }
  }
}

// ── Animated entities (drawn at fractional positions) ───────────────────────
for (const anim of animatedEntities) {
  const { cx, cy } = tileToScreen(anim.pos, offsetX, offsetY, tileW, tileH);
  const sc = scaleOverride.get(anim.id) ?? 1;
  const fl = flashOverride.get(anim.id);
  drawEntityWithOverrides(ctx, cx, cy, anim.role, tileset, sc, fl);
}

// ── Bursts ───────────────────────────────────────────────────────────────────
if (animState) {
  for (const b of animState.bursts) {
    const p = clamp((now - b.startTime) / b.duration, 0, 1);
    const { radiusPx, alpha } = burst(b.tileRadiusPx, p);
    const { cx, cy } = tileToScreen({ x: b.x, y: b.y }, offsetX, offsetY, tileW, tileH);
    const centerX = cx + tileW / 2;
    const centerY = cy + tileH / 2;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.strokeStyle = '#ff8800';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(centerX, centerY, radiusPx, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = `rgba(255, 140, 0, ${alpha * 0.25})`;
    ctx.fill();
    ctx.restore();
  }

  // ── Projectiles ────────────────────────────────────────────────────────────
  for (const proj of animState.projectiles) {
    const p = clamp((now - proj.startTime) / proj.duration, 0, 1);
    const pos = projectile(proj.from, proj.to, p);
    const { cx, cy } = tileToScreen(pos, offsetX, offsetY, tileW, tileH);
    ctx.save();
    ctx.fillStyle = '#ffff00';
    ctx.beginPath();
    ctx.arc(cx + tileW / 2, cy + tileH / 2, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  // ── Miss indicators ────────────────────────────────────────────────────────
  for (const miss of animState.missIndicators) {
    const p = clamp((now - miss.startTime) / miss.duration, 0, 1);
    const { alpha } = missIndicator(p);
    const { cx, cy } = tileToScreen(miss.at, offsetX, offsetY, tileW, tileH);
    const midX = cx + tileW / 2;
    const midY = cy + tileH / 2;
    const s = 8;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.strokeStyle = '#ff4444';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(midX - s, midY - s); ctx.lineTo(midX + s, midY + s);
    ctx.moveTo(midX + s, midY - s); ctx.lineTo(midX - s, midY + s);
    ctx.stroke();
    ctx.restore();
  }
}
```

- [ ] **Step 6: Add `drawEntityWithOverrides` helper**

Add a new helper next to `drawEntity` that accepts scale and flash:

```typescript
function drawEntityWithOverrides(
  ctx: CanvasRenderingContext2D,
  cx: number, cy: number,
  role: EntityRole,
  tileset: Tileset,
  scale: number,
  flashColor: string | undefined,
) {
  const { tileW, tileH } = tileset;
  const midX = cx + tileW / 2;
  const midY = cy + tileH / 2;

  ctx.save();
  if (scale !== 1) {
    ctx.translate(midX, midY);
    ctx.scale(scale, scale);
    ctx.translate(-midX, -midY);
  }

  drawEntity(ctx, cx, cy, role, tileset);

  // Flash overlay: draw a translucent colored diamond over the entity area
  if (flashColor) {
    ctx.fillStyle = flashColor;
    diamond(ctx, cx, cy - tileset.entityH * 0.5, tileW, tileH);
    ctx.fill();
  }
  ctx.restore();
}
```

- [ ] **Step 7: Update the static `useEffect` to call `redrawWithAnim(ctx, null)`**

Replace `redraw()` call in the `useEffect` with `redrawWithAnim(ctx, null)`.

- [ ] **Step 8: Build to verify no TypeScript errors**

```bash
pnpm nx build @org/game
```

Expected: build succeeds.

- [ ] **Step 9: Commit**

```bash
git add apps/dungeon/game/src/game/IsoRenderer.tsx
git commit -m "feat(dungeon-anim): add rAF loop and AnimationState rendering to IsoRenderer"
```

---

## Chunk 5: HUD signals and Game.tsx wiring

### Task 7: SlotHUD — HUD signals

**Files:**
- Modify: `apps/dungeon/game/src/game/SlotHUD.tsx`

Read the current file (91 lines) before editing.

- [ ] **Step 1: Add `HudSignal` prop to `SlotHUDProps`**

```typescript
import { useState, useEffect } from 'react';
import type { HudSignal } from './animation/AnimationScheduler.js';

interface SlotHUDProps {
  slotA: SlotEntry;
  slotB: SlotEntry;
  activeSlot: 'A' | 'B';
  hudSignal?: HudSignal | null;  // new
}
```

- [ ] **Step 2: Add signal state and effect inside `SlotHUD`**

```typescript
export function SlotHUD({ slotA, slotB, activeSlot, hudSignal }: SlotHUDProps) {
  const [flashSlot, setFlashSlot] = useState<'A' | 'B' | null>(null);
  const [failMsg, setFailMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!hudSignal) return;
    if (hudSignal.type === 'slotFlash') {
      setFlashSlot(activeSlot);
      const t = setTimeout(() => setFlashSlot(null), 300);
      return () => clearTimeout(t);
    }
    if (hudSignal.type === 'itemFail') {
      setFailMsg(hudSignal.reason);
      const t = setTimeout(() => setFailMsg(null), 600);
      return () => clearTimeout(t);
    }
    if (hudSignal.type === 'itemWhiff') {
      setFlashSlot(activeSlot);
      const t = setTimeout(() => setFlashSlot(null), 200);
      return () => clearTimeout(t);
    }
  }, [hudSignal, activeSlot]);
```

- [ ] **Step 3: Apply flash styles in the render**

In the existing slot render loop, change the border/boxShadow logic:

```typescript
const isFlashing = flashSlot === slot;
// ...
border: active ? '2px solid #00ffff'
  : isFlashing ? '2px solid #ffff00'
  : '2px solid #333',
boxShadow: active ? '0 0 8px #00ffff88'
  : isFlashing ? '0 0 8px #ffff0088'
  : 'none',
```

And show `failMsg` in the active slot:
```typescript
{failMsg && active && (
  <div style={{
    position: 'absolute', bottom: '4px', left: '4px', right: '4px',
    background: '#cc000088', color: '#ff8888', fontSize: '0.6rem',
    fontFamily: 'monospace', padding: '1px 3px', borderRadius: '3px',
    textAlign: 'center',
  }}>
    {failMsg}
  </div>
)}
```

- [ ] **Step 4: Build to check for type errors**

```bash
pnpm nx build @org/game
```

- [ ] **Step 5: Commit**

```bash
git add apps/dungeon/game/src/game/SlotHUD.tsx
git commit -m "feat(dungeon-anim): add HUD signal support to SlotHUD"
```

---

### Task 8: Game.tsx — wire AnimationScheduler

**Files:**
- Modify: `apps/dungeon/game/src/game/Game.tsx`

Read the full file before editing. Key area: the WebSocket `onmessage` handler at line 215, and the `IsoRenderer` render at line 358.

- [ ] **Step 1: Add imports and refs**

At top of `Game.tsx`, add:
```typescript
import { useRef, useState } from 'react';
import { AnimationScheduler } from './animation/AnimationScheduler.js';
import { emptyAnimationState } from './animation/AnimationState.js';
import type { IsoRendererHandle } from './IsoRenderer.js';
import type { HudSignal } from './animation/AnimationScheduler.js';
```

Inside `GamePage()`, add:
```typescript
const rendererRef = useRef<IsoRendererHandle>(null);
const schedulerRef = useRef(new AnimationScheduler());
const pendingFrameRef = useRef<GameFrame | null>(null);
const [hudSignal, setHudSignal] = useState<HudSignal | null>(null);
```

- [ ] **Step 2: Replace the `setFrame` call in `ws.onmessage` with animated playback**

Find this block in `ws.onmessage` (around line 227):
```typescript
setFrame({
  state: data.state,
  turnEvents: data.turnEvents ?? [],
  slots: data.slots,
  error: data.error,
});
```

Replace with:
```typescript
const newFrame: GameFrame = {
  state: data.state,
  turnEvents: data.turnEvents ?? [],
  slots: data.slots,
  error: data.error,
};

// Cut-and-replace: cancel previous animation and commit previous frame
schedulerRef.current.cancel();
rendererRef.current?.cancelAnimation();
if (pendingFrameRef.current) {
  setFrame(pendingFrameRef.current);
}
pendingFrameRef.current = newFrame;

const animState = emptyAnimationState();
schedulerRef.current.run(
  newFrame.turnEvents,
  animState,
  newFrame.state,
  () => {
    // All phases done — commit final state
    setFrame(pendingFrameRef.current!);
    pendingFrameRef.current = null;
  },
  (signal) => setHudSignal(signal),
);
rendererRef.current?.startAnimating(animState, () => {});
```

- [ ] **Step 3: Pass `ref` and `hudSignal` to child components**

Update `IsoRenderer` usage:
```tsx
<IsoRenderer
  ref={rendererRef}
  grid={state.grid}
  player={state.player}
  enemies={state.enemies}
  tileset={tileset}
  highlightedCells={highlightedCells}
/>
```

Update `SlotHUD` usage:
```tsx
{frame.slots && (
  <SlotHUD
    slotA={frame.slots.A}
    slotB={frame.slots.B}
    activeSlot={frame.slots.activeSlot}
    hudSignal={hudSignal}
  />
)}
```

- [ ] **Step 4: Clear `hudSignal` after each signal to allow re-triggering**

Add a `useEffect` after the `hudSignal` state declaration:
```typescript
useEffect(() => {
  if (!hudSignal) return;
  const t = setTimeout(() => setHudSignal(null), 800);
  return () => clearTimeout(t);
}, [hudSignal]);
```

- [ ] **Step 5: Build**

```bash
pnpm nx build @org/game
```

Expected: builds without errors.

- [ ] **Step 6: Run all tests**

```bash
pnpm nx test @org/game
```

Expected: all tests pass.

- [ ] **Step 7: Commit**

```bash
git add apps/dungeon/game/src/game/Game.tsx
git commit -m "feat(dungeon-anim): wire AnimationScheduler into Game.tsx WebSocket handler"
```

---

## Verification

After all tasks are complete, start the dungeon services and play a few turns:

```bash
# In separate terminals:
pnpm nx serve dungeon-service
pnpm nx serve meta-service
pnpm nx serve @org/game
```

Checklist:
- [ ] Moving one tile: player visibly slides to new tile
- [ ] Melee attack: attacker lunges toward target, target flashes red
- [ ] Rivet gun (ranged): yellow dot travels in the fired direction
- [ ] Rivet gun miss (`item_whiff`): red X appears at target tile
- [ ] Mine placed: yellow tile flash at placement location
- [ ] Explosion: orange circle burst expands at center, white flash on destroyed walls
- [ ] Fire spread: red-orange tile flash at the new tile
- [ ] Death: dying entity shrinks and fades
- [ ] Slot switch (Q key): yellow border flash on SlotHUD
- [ ] Item fail (no ammo): red message on active SlotHUD slot
- [ ] Fast input (two actions quickly): no stale animation, new turn starts cleanly
