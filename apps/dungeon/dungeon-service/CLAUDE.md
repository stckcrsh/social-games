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

**Interactables** on tiles (puzzle inputs): kinds `lever` | `switch` | `dial` | `terminal`, each has `state: number` (0..stateCount-1). `terminal` is special-cased in the plain `interact` action — it's refused with a `noop` ("terminal requires electric activation", `turn.ts:285-288`); only an `electric` item activation (currently just Shock Baton) can advance its state.

**Mechanisms** (conditional tile transformations): evaluate interactable-state conditions; when all met, apply tile change effects (e.g. open a passage); when reset, apply reset effects. Mechanisms can also declare a `cross_room` trigger sourced from another (frozen) room — evaluated separately every turn (see Turn Processing Pipeline / room subsystem below).

**RunState** — the full game state per run: `id, currentRoomId, rooms, grid, player, enemies, overclock, events, status, config, mechanisms, pendingExplosions, profile, runItemState, startReceipt, reconcilePatch?`.

- `currentRoomId: string` / `rooms: Record<string, RoomState>` — multi-room/portal subsystem. Only the *active* room's `grid`/`enemies`/`mechanisms`/`pendingExplosions` live in the top-level `RunState` fields at any time; other visited rooms are frozen into `rooms` (keyed by mapId, shape `RoomState = { mapId, grid, enemies, mechanisms, pendingExplosions }`) when the player steps onto a portal tile. Crossing a portal freezes the current room, loads the target room (from `rooms` if already visited, else lazily from `game/public/tiles/room-<mapId>.tmx`), and repositions the player at the matching enter point (`checkPortalTransition` in `turn.ts`). The shipped `open` preset already has a portal object (`exit-to-corridor` → `open-corridor`) in `open-preset.tmx`, but no `room-open-corridor.tmx` asset exists yet, so today that transition fails to load and the engine leaves the player in place (`lazyLoadRoom` catches the missing file and returns `null`).
- `startReceipt: StartReceipt` — built when the run is created (`parsePreset(...)`). Captures what was "packed" into the run from the caller-supplied `profile`: `{ runId, escrowId?, playerId?, preset, createdAt, packed: { instances, stacks }, capacity, metaMode }`. Exposed via `GET /runs/:id/receipt`. `escrowId`/`playerId` are optional — present only when the run is meta-connected (see Meta Integration below); absent means anonymous ("bypass mode"). `metaMode: 'bypass' | 'strict'` — `'bypass'` (the default) means the run goes `active` immediately; `'strict'` means the run is created with `status: 'pending'` until something external flips it (see `POST /runs` in the API table).
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

`switchSlot` is a special case: it toggles the active loadout slot and returns immediately — free, no turn consumed, none of the steps below run.

For every other action, each tick processes in this order:
1. Player action — move / attack / dash / useActive / interact / wait
2. Portal / room-transition check — if the player ends the action on a portal tile, freeze the current room into `state.rooms`, load/activate the target room, and reposition the player at the matching enter point (`checkPortalTransition`)
3. Mechanism evaluation (active room) — check interactable-state conditions; apply tile-change effects when satisfied, reset effects when un-satisfied (`evaluateMechanisms`)
4. Cross-room mechanism evaluation — mechanisms with a `cross_room` trigger sourced from another (frozen) room are checked against this turn's events (`evaluateCrossRoomMechanisms`)
5. Overclock++ (turn counter)
6. Pickup — auto-collect items on player tile
7. Enemy phase — each enemy queries AI → move → attack adjacent
8. Environmental phase — resolve explosions (destroy weakWalls, ignite oil, damage entities); fire/oil effects; tick effect durations
9. Item cooldown tick
10. End-state check — hp ≤ 0 → dead; on exit tile → extracted. When status transitions off `active`, `reconcilePatch` is computed and an outbox record is written (see Storage — this write is *not* automatically delivered to meta-service).

## Enemy AI (`src/ai/`)

| AI Type | Behavior |
|---------|----------|
| `chase_astar` | A* pathfinding to player every turn |
| `patrol_loop` | Cycles through waypoints; A* fallback if no path |
| `charger` | When aligned (same row/col) dashes toward player; otherwise A* |

Enemy stats differ by preset source, and both coexist in the codebase today:
- **Hardcoded-grid presets** (`default`, `maze`, `oil_trap`, `terminal_door`, `fire_stress`, `mine_chain`, `ai_maze_regression`, `kill_room` — built via `makeEnemy` in `presets.ts`): `hp: 10`, `attackDamage: 3`.
- **TMX-sourced enemies** (`open` preset today, and any lazy-loaded room via `room-*.tmx`): stats come from Tiled object properties (`tmx-loader.ts:127-129`) — `hp` defaults to `10` if unset, but `attackDamage` defaults to `5` if unset. `open-preset.tmx`'s two enemies both explicitly set `attackDamage: 5`.

## Items (`libs/dungeon/items/src/`)

Four weapons, all non-consumable, each in loadout slot A or B:

| Item | Mechanic | Notes |
|------|----------|-------|
| **Hammer** | 1 dmg to adjacent entity | Always hits if entity present |
| **Rivet Gun** | 3 dmg line shot, up to 4 tiles | Needs `ammo_rivet` (1/use); 2-turn cooldown |
| **Remote Mine** | Place on adjacent floor → detonate (radius 1) | Dual-mode; icon changes by state |
| **Shock Baton** | 4 dmg melee to adjacent entity; if the adjacent tile is an `interactable` instead, advances its state | No ammo/cooldown; `electric` — the only way to activate a `terminal` interactable (plain `interact` refuses on `terminal`) |

```ts
interface ItemDef {
  id, name, ammo?, getIconKey(state), activate(ctx): ActivateResult
}
```

## Game Events

28 discriminated event types per turn: movement (`move`, `collision_attack`), combat (`attack`, `death`, `pickup`), interactables (`interacted`, `mechanism_solved`, `mechanism_reset`, `tile_changed`), environmental (`fire_damage`, `fire_spread`, `explosion`, `oil_ignited`, `explosion_wall_destroyed`, `explosion_entity_damage`), items (`item_activate`, `item_hit`, `item_whiff`, `item_fail`, `mine_placed`, `mine_detonated`, `slot_switched`, `item_interact_tile`), rooms (`room_transition`), meta (`player_action`, `run_start`, `run_end`, `noop`).

## HTTP API (`src/api/routes.ts`)

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/runs` | Create run (`preset`: one of 10 — see Map Presets) |
| `GET` | `/runs/:id` | Get current state |
| `GET` | `/runs/:id/receipt` | Get the run's `startReceipt` |
| `GET` | `/runs/:id/reconcile-patch` | Get `reconcilePatch` (404 until the run has ended) |
| `POST` | `/runs/:id/action` | Submit action (always 200; error in body) |
| `POST` | `/runs/:id/tick` | Manually advance one turn (uses an explicit body action, else a queued WS action, else `wait`); also broadcasts over WS |
| `DELETE` | `/runs/:id` | Discard run |
| `POST` | `/runs/:id/debug/oil` | Place oil at (x,y) |
| `POST` | `/runs/:id/debug/explode` | Trigger explosion at (x,y,radius) |
| `GET` | `/debug/reconcile-outbox` | List all outbox records — `403` when `NODE_ENV=production` |
| `POST` | `/debug/reconcile-outbox/:runId/retry` | Attempt to POST one outbox record's patch to meta-service — `403` when `NODE_ENV=production`. This is the **only** code path that delivers a `ReconcilePatch` to meta-service today (see Storage) |

Response shape: `{ "state": RunState, "render": "ASCII", "slots": SlotView, "turnEvents": GameEvent[], "error": "..." }`

## WebSocket Real-Time Stream (`src/api/ws.ts`)

- Upgrade: `GET /runs/:id/ws`
- Server-owned tick loop (`TICK_MS`, default 1000ms)
- Each tick: dequeues latest queued action (or `wait`), processes turn, broadcasts state
- Client → Server: `PlayerAction` JSON
- Server → Client: `{ state, render, turnEvents, error }`
- Tick stops when all clients disconnect or run ends

## Map Presets (`src/models/presets.ts`)

10 presets (`PresetName` union). Most are 20×20, but several override `width`/`height` for smaller test/fixture rooms.

| Preset | Size | Description | Enemies |
|--------|------|-------------|---------|
| `default` | 20×20 | Walled room upper half, lever at (5,7) opens passage, exit lower-right | chase_astar, patrol_loop, charger |
| `open` | 20×20 | Minimal walls; TMX-authored (`open-preset.tmx`); has a portal object to an `open-corridor` room whose TMX asset doesn't exist yet, so the transition currently no-ops | 2× chase_astar |
| `maze` | 20×20 | Dense corridors | 1× chase_astar, 1× patrol_loop |
| `oil_trap` | 10×10 | Dense oil field + weak wall blocking the exit corridor; default loadout Remote Mine/Hammer | 1× chase_astar |
| `terminal_door` | 10×10 | `terminal` interactable requires Shock Baton (`electric`) activation to open a hidden door to the exit; default loadout Shock Baton | 1× patrol_loop |
| `fire_stress` | 20×20 | Large nested oil regions for fire-propagation stress testing | none |
| `mine_chain` | 20×20 | Corridor with weak walls near the start, for Remote Mine chain-detonation testing | 1× chase_astar |
| `ai_maze_regression` | 20×20 | Single long looping corridor, for AI pathfinding regression testing | 1× chase_astar, 1× charger |
| `kill_room` | 5×5 | Player surrounded on all sides → instant death (test fixture) | 8× chase_astar |
| `exit_room` | 2×1 | Player starts adjacent to the exit → one move extracts (test fixture) | none |

## Storage (`src/storage/`)

Run state itself is still **in-memory only** (`Map<runId, RunState>`) — a server restart loses active runs. A run's *outcome* (the `ReconcilePatch`) is durably written to disk on run end, but — see below — that write is not currently followed by any automatic delivery back to meta-service inventory:

- `atomic-write.ts` — `atomicWrite(filePath, data)`: writes to a temp file (`<path>.<pid>.<ts>.tmp`) then renames over the target. Generic helper, not run-specific.
- `mutex-registry.ts` — `getMutex(filePath)`: returns a per-file `Mutex` (from `async-mutex`), created lazily and cached in a module-level `Map`. Ensures concurrent writes to the same file serialize.
- `outbox-store.ts` — durable outbox for `ReconcilePatch`es. On run end (when `status` in `processTurn` transitions off `active`), the patch is written to `data/reconcile_outbox/<runId>.json` (via `atomicWrite` + the file's mutex) with `status: 'pending'`. **That write is the only thing that happens automatically.** There is no background job, cron, or retry loop that drains the outbox and POSTs to meta-service — the sole delivery path is the manual debug endpoint `POST /debug/reconcile-outbox/:runId/retry` (`src/api/routes.ts:163-206`), and that endpoint returns `403` and does nothing whenever `NODE_ENV === 'production'`. In practice: today, in production, an ended run's reconcile patch is durably written to disk but is **not durably delivered** — nothing retries it automatically, and the one endpoint that can send it is unreachable in production. If `record.patch.escrowId` is unset (anonymous run), the retry endpoint skips the send entirely (`{ status: 'skipped', reason: 'no escrowId (bypass mode)' }`) without ever attempting a request.

## Meta Integration

Dungeon runs can optionally be tied to a meta-service player account:

- `POST /runs` accepts optional `playerId`/`escrowId`. If supplied, the run is "meta-connected"; if omitted, it's anonymous ("bypass mode") — the pre-restructure default.
- On run end, `reconcile.ts` builds a `ReconcilePatch` and it's written to the outbox (see Storage above). Delivery to meta-service — `POST ${META_SERVICE_URL}/runs/escrows/:escrowId/resolve` — only happens if something calls the manual debug retry endpoint (`POST /debug/reconcile-outbox/:runId/retry`), which is disabled in production. There is currently no automatic dispatch path.
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
