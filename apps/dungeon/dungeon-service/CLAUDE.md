# Dungeon Service — Deep Dive

NX project: `dungeon-service` | Port: 3001 | Fastify v5 HTTP+WS game server

For service list, ports, and build/run commands see [`apps/dungeon/CLAUDE.md`](../CLAUDE.md).

## Core Types (`libs/dungeon/shared/src/dungeon/types.ts`)

```ts
type Direction = 'N' | 'E' | 'S' | 'W';
type TileType  = 'floor' | 'wall' | 'weakWall' | 'door' | 'exit' | 'hazard' | 'interactable';
type Slot      = 'A' | 'B';

interface Pos    { x: number; y: number; }
interface Entity { id, kind, pos, hp, maxHp, attackDamage, aiType?, state }
interface Tile   { type, items: ItemDrop[], interactable?, effects: Effect[] }
type Grid = Tile[][];
```

**Effects** on tiles:
- `oil` — flammable, no inherent damage
- `fire` — damages entities each turn, spreads to adjacent oil, duration-based

**Interactables** on tiles (puzzle inputs): kinds `lever` | `switch` | `dial`, each has `state: number` (0..stateCount-1).

**Mechanisms** (conditional tile transformations): evaluate interactable-state conditions; when all met, apply tile change effects (e.g. open a passage); when reset, apply reset effects.

**RunState** — the full game state per run: `id, grid, player, enemies, overclock, events, status, config, mechanisms, pendingExplosions, profile, runItemState, startReceipt, reconcilePatch?`.

- `startReceipt: StartReceipt` — built when the run is created (`parsePreset(...)`). Captures what was "packed" into the run from the caller-supplied `profile`: `{ runId, escrowId?, playerId?, preset, createdAt, packed: { instances, stacks }, capacity }`. Exposed via `GET /runs/:id/receipt`. `escrowId`/`playerId` are optional — present only when the run is meta-connected (see Meta Integration below); absent means anonymous ("bypass mode").
- `reconcilePatch?: ReconcilePatch` — built on run end (`computeReconcilePatch` in `src/engine/reconcile.ts`): `{ runId, escrowId?, playerId?, result, createdAt, consume: { instances, stacks }, grant: { instances, stacks }, durabilityUpdates }`. On `dead`/`abandoned`, consumes all escrowed ammo stacks from `startReceipt`; on `extracted`, consumes nothing and grants nothing (loot drops are not wired into inventory yet — see Meta Integration).

## Player Actions

```ts
type PlayerAction =
  | { type: 'move';      dir: Direction }
  | { type: 'attack';    dir: Direction }
  | { type: 'dash';      dir: Direction }      // multi-tile sprint until blocked
  | { type: 'useActive'; dir: Direction }      // activate equipped item
  | { type: 'switchSlot' }                     // toggle A/B (free—no turn consumed)
  | { type: 'interact' }                       // activate nearest interactable
  | { type: 'wait' };
```

## Turn Processing Pipeline (`src/engine/turn.ts`)

Each tick processes in this order:
1. Player action — move / attack / dash / useActive / interact / wait / switchSlot
2. Overclock++ (turn counter)
3. Pickup — auto-collect items on player tile
4. Enemy phase — each enemy queries AI → move → attack adjacent
5. Environmental phase — resolve explosions (destroy weakWalls, ignite oil, damage entities); fire/oil effects; tick effect durations
6. Item cooldown tick
7. End-state check — hp ≤ 0 → dead; on exit tile → extracted

## Enemy AI (`src/ai/`)

| AI Type | Behavior |
|---------|----------|
| `chase_astar` | A* pathfinding to player every turn |
| `patrol_loop` | Cycles through waypoints; A* fallback if no path |
| `charger` | When aligned (same row/col) dashes toward player; otherwise A* |

All enemies: `hp: 10`, `attackDamage: 3`.

## Items (`libs/dungeon/items/src/`)

Three weapons, all non-consumable, each in loadout slot A or B:

| Item | Mechanic | Notes |
|------|----------|-------|
| **Hammer** | 1 dmg to adjacent entity | Always hits if entity present |
| **Rivet Gun** | 3 dmg line shot, up to 4 tiles | Needs `ammo_rivet` (1/use); 2-turn cooldown |
| **Remote Mine** | Place on adjacent floor → detonate (radius 1) | Dual-mode; icon changes by state |

```ts
interface ItemDef {
  id, name, ammo?, getIconKey(state), activate(ctx): ActivateResult
}
```

## Game Events

25+ discriminated event types per turn: movement (`move`, `collision_attack`), combat (`attack`, `death`, `pickup`), interactables (`interacted`, `mechanism_solved`, `mechanism_reset`), environmental (`fire_damage`, `fire_spread`, `explosion`, `oil_ignited`, `explosion_wall_destroyed`, `explosion_entity_damage`), items (`item_activate`, `item_hit`, `item_whiff`, `item_fail`, `mine_placed`, `mine_detonated`, `slot_switched`), meta (`player_action`, `run_end`, `noop`).

## HTTP API (`src/api/routes.ts`)

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/runs` | Create run (`preset`: default/open/maze) |
| `GET` | `/runs/:id` | Get current state |
| `POST` | `/runs/:id/action` | Submit action (always 200; error in body) |
| `DELETE` | `/runs/:id` | Discard run |
| `POST` | `/runs/:id/debug/oil` | Place oil at (x,y) |
| `POST` | `/runs/:id/debug/explode` | Trigger explosion at (x,y,radius) |

Response shape: `{ "state": RunState, "render": "ASCII", "slots": SlotView, "turnEvents": GameEvent[], "error": "..." }`

## WebSocket Real-Time Stream (`src/api/ws.ts`)

- Upgrade: `GET /runs/:id/ws`
- Server-owned tick loop (`TICK_MS`, default 1000ms)
- Each tick: dequeues latest queued action (or `wait`), processes turn, broadcasts state
- Client → Server: `PlayerAction` JSON
- Server → Client: `{ state, render, turnEvents, error }`
- Tick stops when all clients disconnect or run ends

## Map Presets (`src/models/presets.ts`)

All maps are 20×20.

| Preset | Description | Enemies |
|--------|-------------|---------|
| `default` | Walled room upper half, lever at (5,7) opens passage, exit lower-right | chase_astar, patrol_loop, charger |
| `open` | Minimal walls | 2× chase_astar |
| `maze` | Dense corridors | 2× chase_astar |

## Storage (`src/storage/`)

Run state itself is still **in-memory only** (`Map<runId, RunState>`) — a server restart loses active runs. What's durable is the reconciliation of a run's *outcome* back to meta-service inventory:

- `atomic-write.ts` — `atomicWrite(filePath, data)`: writes to a temp file (`<path>.<pid>.<ts>.tmp`) then renames over the target. Generic helper, not run-specific.
- `mutex-registry.ts` — `getMutex(filePath)`: returns a per-file `Mutex` (from `async-mutex`), created lazily and cached in a module-level `Map`. Ensures concurrent writes to the same file serialize.
- `outbox-store.ts` — durable outbox for `ReconcilePatch`es. On run end, the patch is written to `data/reconcile_outbox/<runId>.json` (via `atomicWrite` + the file's mutex) with `status: 'pending' | 'sent' | 'failed'`, before it's POSTed to meta-service. This means a crash between "run ended" and "meta-service acknowledged" doesn't lose the reconcile — it's retried from the outbox record. If `record.patch.escrowId` is unset (anonymous run), delivery is skipped entirely (`{ status: 'skipped', reason: 'no escrowId (bypass mode)' }`).

## Meta Integration

Dungeon runs can optionally be tied to a meta-service player account:

- `POST /runs` accepts optional `playerId`/`escrowId`. If supplied, the run is "meta-connected"; if omitted, it's anonymous ("bypass mode") — the pre-restructure default.
- On run end, `reconcile.ts` builds a `ReconcilePatch` and the server POSTs it to meta-service at `${META_SERVICE_URL}/runs/escrows/:escrowId/resolve` (skipped in bypass mode).
- **Ammo/consumables**: connected — on death/abandon, escrowed ammo stacks are consumed from the player's meta inventory via this flow.
- **Loot drops → meta inventory**: not connected yet — `grant` is always empty; the code comment in `reconcile.ts` says explicitly "loot not wired yet".
- **Meta inventory → dungeon loadout**: the `profile` used to build `startReceipt` comes from the request body of `POST /runs`, not fetched from meta-service by dungeon-service itself — the caller is responsible for supplying it.
- **Auth**: the resolve callback (`/runs/escrows/:escrowId/resolve`) is explicitly unauthenticated, service-to-service. Dungeon-service's own routes don't require a meta-service JWT.

## Client Rendering (`apps/dungeon/game`)

React 18 + Vite. Three screens: Lobby → Playing → Ended.

| Key | Action |
|-----|--------|
| Arrow keys | move N/S/E/W |
| W/A/S/D | useActive N/W/S/E |
| E | interact |
| Space | wait |
| Q / ESC | quit |

Isometric canvas renderer (`IsoRenderer.tsx`) — painter's algorithm (ascending x+y diagonal), per-tile colors, entity colors by AI type, `tileset.ts` defines color/dimension constants. HUD shows turn count, HP, slot state, last 10 events as readable text.

## Extensibility Points

| What to add | Where |
|------------|-------|
| New item | `libs/dungeon/items/src/` — implement `ItemDef`, export from `index.ts` |
| New AI behavior | `src/ai/` — implement function, register in `aiRegistry` |
| New tile type | Update `TileType` in `libs/dungeon/shared`, add handling in engine |
| New effect | Add to `EFFECT_RULES` + `EFFECT_RESOLVERS` in `effects.ts` |
| New map preset | Add to `src/models/presets.ts` |
| New interactable kind | Add to `InteractableKind` union + handling in `mechanisms.ts` |
