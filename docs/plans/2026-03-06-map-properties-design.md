# Map Properties Design

**Date:** 2026-03-06
**Status:** Approved

## Problem

The current preset system encodes map layout as a string grid with character codes and stores interactable/mechanism metadata as hardcoded `"x,y"` position keys in TypeScript. This is difficult to author, doesn't support named references between objects, and has no concept of map-to-map connections or per-enemy configuration. The goal is to make TMX the single source of truth for all spatial map data while keeping mechanism logic in code.

---

## Decision: TMX-Property-Driven Maps

All spatial metadata moves into Tiled TMX files as named object layers. The TypeScript preset file becomes a thin wrapper. One run can span multiple rooms; room state persists across transitions within the same run.

---

## 1. TMX Object Layers

Each map TMX defines named object layers alongside the existing tile layers. The engine parses these at run-start and builds a `nameIndex: Record<string, {x, y}>` for name→coordinate resolution.

### `triggers`
Named interactable points (levers, switches, terminals, dials).

| Property | Type | Description |
|---|---|---|
| `name` | string | Globally unique ID (e.g. `"lever-a"`). Referenced by mechanism code. |
| `interactableKind` | string | `lever` / `switch` / `dial` / `terminal` |
| `label` | string | Display label shown to the player |
| `stateCount` | int | Number of discrete states (default 2) |

### `enemies`
Enemy spawn points with full per-instance config. No slot numbers.

| Property | Type | Description |
|---|---|---|
| `aiType` | string | `chase_astar` / `patrol_loop` / `charger` |
| `hp` | int | Max HP |
| `damage` | int | Attack damage |
| `aggroRange` | int | Tiles at which enemy becomes aware of player |
| `patrolWaypoints` | string | JSON array of `[{x,y}, ...]` for `patrol_loop` enemies |

### `portals`
Map-to-map connection points. Two complementary object types per connection.

**`map_exit`** — where the player steps to leave this map:

| Property | Type | Description |
|---|---|---|
| `targetMapId` | string | Preset ID of the destination map |
| `targetEnterId` | string | `name` of the `map_enter` object in the destination map |

**`map_enter`** — named arrival point. Other maps' `map_exit` objects reference this by `name`. A map can have multiple enter points, one per connecting map/direction.

Example of a bidirectional connection between two maps:
- Map A: `map_exit` with `targetMapId: "room-b"`, `targetEnterId: "enter-from-a"`
- Map B: `map_enter` named `"enter-from-a"` + its own `map_exit` back to A

### `extract`
A single object marking the extraction point. Player stepping on it sets `status = 'extracted'` and ends the run. Replaces the current `X` character in the string grid.

### `spawns`
Player spawn points.

| Property | Type | Description |
|---|---|---|
| `name` | string | `"default"` for normal run start; additional names referenced by `map_exit` objects in other maps |

---

## 2. TypeScript Preset (Thin Wrapper)

The string grid and positional interactable/mechanism maps are removed. The preset file holds only what cannot live in TMX:

```ts
interface PresetDef {
  id: string;
  tmxUrl: string;              // path to TMX file
  config?: Partial<RunConfig>; // map dimensions, game mechanic overrides
  mechanisms: MechanismDef[];  // logic stays in code
}
```

---

## 3. Mechanism System

Mechanisms reference TMX object names instead of `"x,y"` coordinates. The engine resolves names at run-start via `nameIndex`.

### `MechanismDef`

```ts
interface MechanismDef {
  id: string;
  triggers: TriggerMatcher[];       // what fires this mechanism
  conditions: MechanismCondition[]; // state that must hold when triggered
  effects: MechanismEffect[];       // applied when triggered + conditions met
  resetEffects: MechanismEffect[];  // applied when conditions no longer hold
  satisfied: boolean;
}
```

Effects reference TMX object names instead of raw coordinates:
```ts
interface TileChangeEffect {
  type: 'tile_change';
  targetName: string; // name of a TMX object; resolved to {x,y} at run-start
  to: TileType;
}
```

### `TriggerMatcher`

All triggers fire from existing game events — no new message types or endpoints.

```ts
type TriggerMatcher =
  | { kind: 'interact';     triggerPointId: string }
  | { kind: 'item_hit';     triggerPointId: string; itemId?: string }
  | { kind: 'entity_death'; entityId?: string }
  | { kind: 'explosion';    triggerPointId: string }
  | { kind: 'turn_elapsed'; afterTurn: number }
  | { kind: 'cross_room';   sourceMapId: string; triggerPointId: string }
```

The engine emits all these as part of its existing turn loop (`item_hit`, `death`, `mine_detonated`, etc.). The TriggerBus matches emitted events against mechanism trigger definitions each turn. New `kind` values can be added without affecting existing mechanisms.

---

## 4. Multi-Room RunState

A single run spans multiple rooms. The player carries HP and inventory across room transitions. Each room's grid, enemies, and mechanisms persist independently.

```ts
interface RunState {
  id: string;
  currentRoomId: string;             // which room the player is in now
  rooms: Record<string, RoomState>;  // all room states, frozen between visits
  player: Entity;
  overclock: number;
  status: 'active' | 'dead' | 'extracted';
  // ... rest unchanged
}

interface RoomState {
  mapId: string;
  grid: Grid;
  enemies: Entity[];
  mechanisms: MechanismDef[];
  pendingExplosions: Array<{ x: number; y: number; radius: number }>;
}
```

### Room Transitions

When the player steps on a `map_exit` tile:
1. Current `RoomState` is frozen into `rooms[currentRoomId]`
2. Target room is loaded (from TMX if first visit, or from `rooms[targetMapId]` if returning)
3. Player position is set to the `map_enter` spawn point
4. `currentRoomId` is updated

### Cross-Room Triggers

Since all `RoomState` objects are held in memory within the same `RunState`, cross-room triggers require no special routing. Each turn, the engine broadcasts trigger events across all rooms in the run and evaluates mechanism matchers in all rooms simultaneously.

---

## What Changes

| Component | Before | After |
|---|---|---|
| Map layout | String grid in `presets.ts` | TMX tile layers |
| Interactables | `Record<"x,y", InteractableDef>` in preset | TMX `triggers` layer |
| Enemies | Digit chars in grid (`1`–`9`) + hardcoded AI mapping | TMX `enemies` layer with full config |
| Exits | `X` char in grid (extraction only) | TMX `portals` layer (`map_exit` / `map_enter`) + `extract` object |
| Mechanism targets | Hardcoded `{x, y}` in `MechanismDef` | Named references resolved via `nameIndex` |
| Mechanism triggers | Interactable state conditions only | `TriggerMatcher` union covering interact, item_hit, death, explosion, turn, cross-room |
| Run scope | Single room | Multi-room via `rooms: Record<string, RoomState>` |
