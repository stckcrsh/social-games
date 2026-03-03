# Dungeon Engine API

A turn-based 2D grid dungeon crawler engine. Runs on port `3001` by default (`PORT` env var to override).

All runs are **in-memory only** — state is lost on server restart.

---

## Quick Start

```bash
# Start server
pnpm nx serve dungeon-engine

# Create a run
curl -s -X POST http://localhost:3001/runs \
  -H 'Content-Type: application/json' \
  -d '{}' | jq .

# Move the player east
curl -s -X POST http://localhost:3001/runs/<runId>/action \
  -H 'Content-Type: application/json' \
  -d '{"type":"move","dir":"E"}' | jq .render
```

---

## Endpoints

### `POST /runs` — Create a run

Creates a new dungeon run, populated from a preset map with enemies already placed.

**Request body** (all fields optional):

```json
{
  "preset": "default",
  "config": {
    "allowDiagonalCornerCutting": false,
    "dashDistance": 2,
    "chargerDashDistance": 2
  }
}
```

| Field | Type | Default | Description |
|---|---|---|---|
| `preset` | `"default"` \| `"open"` \| `"maze"` | `"default"` | Starting map layout |
| `config.allowDiagonalCornerCutting` | boolean | `false` | Whether diagonal moves through wall corners are allowed |
| `config.dashDistance` | integer 1–10 | `2` | Max tiles the player travels on a `dash` action |
| `config.chargerDashDistance` | integer 1–10 | `2` | Max tiles the charger enemy travels per turn when aligned |

**Response** `201`:

```json
{
  "runId": "uuid",
  "state": { ... },
  "render": "####################\n#P...\n..."
}
```

---

### `GET /runs/:id` — Get run state

Returns the current state of a run.

**Response** `200`:

```json
{
  "state": { ... },
  "render": "####################\n#P...\n..."
}
```

**Response** `404` if run not found.

---

### `POST /runs/:id/action` — Submit a player action

Advances the simulation by one turn. The player acts first, then enemies act in ascending `id` order.

**Always returns HTTP 200** even if the action is invalid. Check the `error` field to detect invalid actions — on error the state is unchanged and the turn is not consumed.

**Request body**: a [Player Action](#player-actions) object.

**Response**:

```json
{
  "state": { ... },
  "render": "####################\n#P...\n...",
  "turnEvents": [ ... ],
  "error": "Move blocked by wall"
}
```

`error` is omitted when the action succeeds. `turnEvents` contains only the events from this turn; `state.events` is the full append-only log across all turns.

**Response** `400` if the action body fails schema validation (malformed JSON, unknown action type, etc.).

**Response** `404` if run not found.

---

### `GET /runs/:id/ws` — WebSocket stream

Upgrades to a WebSocket connection. The server owns the beat clock: it ticks every `TICK_MS` ms (default 1000 ms, override with `TICK_MS` env var), consumes the most-recently queued player action (or `wait` if none), and broadcasts the new state to all connected clients.

**On connect:** the current state is sent immediately.

**Client → server** (send a [Player Action](#player-actions) as JSON):
```json
{ "type": "move", "dir": "N" }
```
Last message before the next tick wins (rapid keypresses are coalesced).

**Server → client** (on every tick):
```json
{
  "state": { ... },
  "render": "...",
  "turnEvents": [ ... ],
  "error": "optional — present only when the queued action was invalid"
}
```

**Tick stops** when all clients disconnect or the run ends (`dead` / `extracted`).

---

### `DELETE /runs/:id` — Discard a run

Removes the run from memory.

**Response** `204` on success, `404` if not found.

---

## Player Actions

All actions are submitted as JSON to `POST /runs/:id/action`.

### `move`

Move one tile in a cardinal direction.

```json
{ "type": "move", "dir": "E" }
```

**Invalid** (turn not consumed, `error` returned) if:
- Target tile is out of bounds
- Target tile is a wall
- An enemy occupies the target tile — use `attack` instead

**Valid** outcomes:
- Player moves to target tile
- Items on the destination tile are automatically picked up

---

### `attack`

Attack the tile adjacent in a direction. **Always consumes the turn**, even if the tile is empty.

```json
{ "type": "attack", "dir": "N" }
```

- If an enemy occupies the target tile: deals `player.attackDamage` (5) to it
- If the tile is empty or out of bounds: logs a `noop` event and the turn is consumed with no other effect
- Cannot attack the player's own tile (requires a direction)

---

### `dash`

Move up to `config.dashDistance` tiles in a direction in a single turn. Stops at the last clear tile before a wall or enemy.

```json
{ "type": "dash", "dir": "W" }
```

**Invalid** if the first step is blocked (wall or enemy).

**Valid** outcomes:
- Player teleports to the furthest reachable tile up to `dashDistance` steps away
- Items on the destination tile are automatically picked up

The dash does not damage enemies it stops in front of — use `attack` or position yourself for an enemy to collide into you.

---

### `useItem` *(stub)*

Consume a held item by ID. Currently a no-op that consumes the turn.

```json
{ "type": "useItem", "itemId": "some-item-id" }
```

---

### `interact`

Interact with the nearest interactable. Scans the player's current tile first, then the four cardinal neighbors (N, E, S, W) and targets the first `interactable` tile found.

```json
{ "type": "interact" }
```

**Valid** outcomes (turn always consumed):
- If an interactable is found: advances its state and emits an `interacted` event; then the mechanism evaluator runs and may emit `tile_changed`, `mechanism_solved`, or `mechanism_reset` events
- If no interactable is nearby: emits `noop`

**Interactable kinds:**

| Kind | Behavior |
|---|---|
| `lever` | Cycles through 2 states (0 → 1 → 0 → …) — binary toggle |
| `switch` | One-way: transitions from state 0 to 1 once; further interactions are a `noop` |
| `dial` | Cycles through N states (0 → 1 → … → N-1 → 0 → …) |

---

### `wait`

Do nothing this turn. Overclock increments and enemies act normally. Used automatically by the WebSocket tick loop when no action has been queued.

```json
{ "type": "wait" }
```

---

## Directions

Used by `move`, `attack`, and `dash`. The coordinate system has `(0,0)` at the top-left, with `x` increasing east and `y` increasing south. Only the four cardinal directions are supported.

| Value | Description | dx | dy |
|---|---|---|---|
| `N` | North (up) | 0 | -1 |
| `E` | East (right) | +1 | 0 |
| `S` | South (down) | 0 | +1 |
| `W` | West (left) | -1 | 0 |

---

## Turn Order

Each valid player action triggers a full turn:

1. **Player action** — resolved first; if invalid, turn is aborted and state is unchanged
2. **Overclock** increments by 1
3. **Player pickup** — all items on the player's current tile are auto-collected
4. **Enemy phase** — each living enemy acts in ascending `id` order:
   - Queries its AI behavior for an intent (move or none)
   - If moving: steps toward intent, one tile at a time. Stops at walls. On collision with any entity: deals collision damage and stops
   - After moving: attacks the nearest adjacent entity (player preferred over other enemies)
5. **End check** — if `player.hp <= 0` → `status: "dead"`; if player is on an `exit` tile → `status: "extracted"`

Once a run reaches `dead` or `extracted`, further actions return an error and the state is not advanced.

---

## Run State

```ts
{
  id: string           // UUID
  status: "active" | "dead" | "extracted"
  overclock: number    // turn counter, starts at 0
  player: {
    id: "player"
    pos: { x: number, y: number }
    hp: number
    maxHp: number      // 20
    attackDamage: number  // 5
    state: {}
  }
  enemies: Entity[]    // sorted by id, dead enemies are removed
  grid: Tile[][]       // grid[y][x]
  events: GameEvent[]  // full history of all turns
  config: RunConfig
}
```

---

## Turn Events

`turnEvents` in the action response describes exactly what happened during the turn.

| Event | Fields | Description |
|---|---|---|
| `player_action` | `action` | The action that was submitted |
| `move` | `entityId`, `from`, `to` | An entity moved |
| `attack` | `attackerId`, `targetId`, `damage` | A deliberate attack after movement |
| `collision_attack` | `attackerId`, `targetId`, `damage` | An enemy walked into another entity |
| `death` | `entityId` | An entity reached 0 HP and was removed |
| `pickup` | `entityId`, `item` | Player collected an item |
| `run_end` | `reason: "dead" \| "extracted"` | The run ended |
| `noop` | `reason` | A valid action with no effect (empty attack, no nearby interactable, etc.) |
| `interacted` | `entityId`, `interactableId`, `kind`, `label`, `newState` | Player interacted with an interactable and advanced its state |
| `tile_changed` | `x`, `y`, `from`, `to` | A tile's type changed (e.g. wall → floor) due to a mechanism effect |
| `mechanism_solved` | `mechanismId` | All conditions of a mechanism became true; effects were applied |
| `mechanism_reset` | `mechanismId` | A previously-satisfied mechanism's conditions became false; reset effects were applied |

---

## ASCII Render

The `render` field is a plain-text representation of the grid, useful for quick visual debugging.

```
####################
#P.................#
#..................#
#....#####.........#
#....#..e..#.......#
...
Turn: 3  Player HP: 20/20  Status: active
```

**Legend:**

| Char | Meaning |
|---|---|
| `#` | Wall |
| `.` | Floor (empty) |
| `$` | Floor with items |
| `E` | Exit tile |
| `H` | Hazard tile |
| `I` | Interactable tile (inactive, state 0) |
| `i` | Interactable tile (active, state ≥ 1) |
| `P` | Player |
| `e` | Enemy |

Entities take priority over tiles in the render. Items are only shown (`$`) when no entity is present.

---

## Map Presets

| Preset | Description | Enemies |
|---|---|---|
| `default` | 20×20 with a walled room in the upper half and the exit in the lower right; includes a lever at (5,7) that opens a passage at (5,6) into the walled room | 3 enemies: `chase_astar`, `patrol_loop`, `charger` |
| `open` | 20×20 with minimal walls, open floor | 2 enemies: `chase_astar` |
| `maze` | 20×20 with dense corridors | 2 enemies: `chase_astar` |

---

## Enemy AI Types

| AI | Behavior |
|---|---|
| `chase_astar` | Pathfinds directly toward the player each turn using A* |
| `patrol_loop` | Cycles through a fixed set of waypoints; falls back to A* if no path configured |
| `charger` | Dashes up to `chargerDashDistance` tiles when aligned with the player (same row or column); otherwise pathfinds like `chase_astar` |

All enemies have `hp: 10`, `maxHp: 10`, and `attackDamage: 3` by default.
