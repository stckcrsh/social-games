# Social Games — System Overview

> Last updated: 2026-03-04
> Purpose: AI context seed for planning next features.

---

## Monorepo Structure

NX integrated monorepo, pnpm workspaces, Node 24.

```
apps/
  dungeon-service   — Fastify v5 game engine server      (port 3001, HTTP + WS)
  dungeon-ui        — React 18 + Vite isometric renderer  (port 4201)
  meta-service      — Fastify v5 meta backend             (port 3000, HTTP)
  meta-ui           — React 18 + Vite admin/dev UI        (port 4200)

libs/
  shared            — @org/shared: all shared types + grid utilities
  items             — @org/items: item modules, ITEM_DEFS, META_DEFS, helpers

packages/
  proxy             — Caddy reverse proxy (Caddyfile)
  dungeon-ui-e2e    — Playwright E2E tests
```

---

## 1. Dungeon System

### Purpose
Real-time turn-based roguelike crawler. Players explore 2D grid dungeons, fight enemies, solve puzzles via interactables/mechanisms, and use weapons with unique mechanics.

### 1.1 Core Types (`libs/shared/src/dungeon/types.ts`)

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

**Interactables** on tiles (puzzle inputs):
- Kinds: `lever` | `switch` | `dial`
- Each has a `state: number` (0..stateCount-1)

**Mechanisms** (conditional tile transformations):
- Evaluate a set of interactable-state conditions
- When all conditions met → apply tile change effects (e.g., open a passage)
- When reset → apply reset effects

**RunState** — the full in-memory game state:
```ts
interface RunState {
  id, grid, player, enemies, overclock,  // turn counter
  events: GameEvent[],                   // append-only event log
  status: 'active' | 'dead' | 'extracted',
  config: RunConfig,
  mechanisms: MechanismDef[],
  pendingExplosions: { x, y, radius }[],
  profile: PlayerProfile,               // inventory + loadout
  runItemState: { A: RunItemState, B: RunItemState }
}
```

### 1.2 Player Actions

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

### 1.3 Turn Processing Pipeline (`apps/dungeon-service/src/engine/turn.ts`)

Each tick processes in this order:

1. **Player action** — move / attack / dash / useActive / interact / wait / switchSlot
2. **Overclock++** (turn counter)
3. **Pickup** — auto-collect items on player tile
4. **Enemy phase** — each enemy queries AI → move → attack adjacent
5. **Environmental phase**
   - Resolve explosions (destroy weakWalls, ignite oil, damage entities)
   - Fire/oil effects (damage entities, spread fire)
   - Tick effect durations (remove expired)
6. **Item cooldown tick**
7. **End-state check** — hp ≤ 0 → dead; on exit tile → extracted

### 1.4 Enemy AI (`apps/dungeon-service/src/ai/`)

| AI Type | Behavior |
|---------|----------|
| `chase_astar` | A* pathfinding to player every turn |
| `patrol_loop` | Cycles through waypoints; A* fallback if no path |
| `charger` | When aligned (same row/col) dashes toward player; otherwise A* |

All enemies: `hp: 10`, `attackDamage: 3`.

### 1.5 Items (`libs/items/src/`)

Three weapons, all non-consumable. Each lives in a loadout slot (A or B).

| Item | Mechanic | Notes |
|------|----------|-------|
| **Hammer** | 1 dmg to adjacent entity | Always hits if entity present |
| **Rivet Gun** | 3 dmg line shot, up to 4 tiles | Needs `ammo_rivet` (1/use); 2-turn cooldown |
| **Remote Mine** | Place on adjacent floor → detonate (radius 1) | Dual-mode; icon changes by state |

Items expose:
```ts
interface ItemDef {
  id, name, ammo?, getIconKey(state), activate(ctx): ActivateResult
}
```

### 1.6 Game Events

25+ discriminated event types emitted per turn:
- Movement: `move`, `collision_attack`
- Combat: `attack`, `death`, `pickup`
- Interactables: `interacted`, `mechanism_solved`, `mechanism_reset`
- Environmental: `fire_damage`, `fire_spread`, `explosion`, `oil_ignited`, `explosion_wall_destroyed`, `explosion_entity_damage`
- Items: `item_activate`, `item_hit`, `item_whiff`, `item_fail`, `mine_placed`, `mine_detonated`, `slot_switched`
- Meta: `player_action`, `run_end`, `noop`

### 1.7 HTTP API (`apps/dungeon-service/src/api/routes.ts`)

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/runs` | Create run (`preset`: default/open/maze) |
| `GET` | `/runs/:id` | Get current state |
| `POST` | `/runs/:id/action` | Submit action (always 200; error in body) |
| `DELETE` | `/runs/:id` | Discard run |
| `POST` | `/runs/:id/debug/oil` | Place oil at (x,y) |
| `POST` | `/runs/:id/debug/explode` | Trigger explosion at (x,y,radius) |

**Response shape:**
```json
{ "state": RunState, "render": "ASCII", "slots": SlotView, "turnEvents": GameEvent[], "error": "..." }
```

### 1.8 WebSocket Real-Time Stream (`apps/dungeon-service/src/api/ws.ts`)

- **Upgrade:** `GET /runs/:id/ws`
- Server-owned tick loop (`TICK_MS`, default 1000ms)
- Each tick: dequeues latest queued action (or `wait`), processes turn, broadcasts state
- **Client → Server:** `PlayerAction` JSON
- **Server → Client:** `{ state, render, turnEvents, error }`
- Tick stops when all clients disconnect or run ends

### 1.9 Map Presets (`apps/dungeon-service/src/models/presets.ts`)

All maps are 20×20.

| Preset | Description | Enemies |
|--------|-------------|---------|
| `default` | Walled room upper half, lever at (5,7) opens passage, exit lower-right | chase_astar, patrol_loop, charger |
| `open` | Minimal walls | 2× chase_astar |
| `maze` | Dense corridors | 2× chase_astar |

### 1.10 Dungeon UI (`apps/dungeon-ui/`)

React 18 + Vite. Three screens: **Lobby → Playing → Ended**.

**Key bindings:**

| Key | Action |
|-----|--------|
| Arrow keys | move N/S/E/W |
| W/A/S/D | useActive N/W/S/E |
| E | interact |
| Space | wait |
| Q / ESC | quit |

**Isometric canvas renderer** (`IsoRenderer.tsx`):
- Painter's algorithm (ascending x+y diagonal)
- Per-tile colors for walls, floors, shadows
- Entity colors differentiated by AI type
- `tileset.ts` defines all color/dimension constants

**HUD:** turn count, HP, slot state, last 10 events as readable text.

### 1.11 Storage

Runs are **in-memory only** (`Map<runId, RunState>`). No persistence — runs are lost on server restart.

---

## 2. Meta System

### Purpose
Server-authoritative backend for accounts, persistent inventory, a static item shop, and peer-to-peer item trading. Named *Clockwork Abyss* internally.

### 2.1 Auth (`apps/meta-service/src/auth/`)

Stateless JWT (bcrypt passwords, no token blocklist).

| Route | Description |
|-------|-------------|
| `POST /auth/register` | Create account (username 3-32 chars, password 8-128 chars) |
| `POST /auth/login` | Returns JWT (default 7d expiry) |
| `POST /auth/logout` | Client-side only (stateless) |
| `POST /auth/change-password` | Requires current password |
| `POST /auth/admin/reset-password` | Admin only |

**JWT payload:** `{ playerId, username, roles: ('player' \| 'admin')[] }`

### 2.2 Item Definitions (`apps/meta-service/src/content/`)

Static catalog loaded at startup from `data/item_defs.json`.

```ts
interface MetaItemDef {
  defId, name,
  category: 'consumable' | 'gear' | 'trinket' | 'material' | 'currency',
  rarity:   'common' | 'uncommon' | 'rare' | 'epic' | 'legendary',
  stackable: boolean, maxStack: number,
  description, effects, tradeable
}
```

| Route | Description |
|-------|-------------|
| `GET /content/item-defs` | All definitions |
| `GET /content/item-defs/:defId` | Single definition |

### 2.3 Inventory (`apps/meta-service/src/inventory/`)

Per-player inventory. Two kinds of items:
- **Instances** — unique UUID items (gear, etc.)
- **Stacks** — integer quantity by defId (materials, currency, ammo)

```ts
interface PlayerInventory {
  playerId: string;
  instances: Record<itemId, ItemInstance>;
  stacks:    Record<defId, number>;
}
```

| Route | Description |
|-------|-------------|
| `GET /players/me/inventory` | Own inventory (auth required) |
| `POST /players/me/inventory/grant` | Admin: grant items |
| `POST /players/me/inventory/burn` | Admin: remove items |
| `POST /players/me/inventory/transfer` | Admin: move items between players |

### 2.4 Shop (`apps/meta-service/src/shop/`)

Offer-driven, static offers loaded from `data/shop_offers.json`.

```ts
interface ShopOffer {
  offerId, title, description,
  price: { defId, qty }[],
  grant: GrantEntry[],
  stock: 'infinite' | { kind: 'limited', remaining: number },
  limitPerPlayer?,
  availability?: { kind: 'always' | 'daily' | 'weekly' },
  requires?: { role?, unlockFlag? }[]
}
```

| Route | Description |
|-------|-------------|
| `GET /shop/offers` | List all offers |
| `POST /shop/purchase` | Purchase (idempotent via client key) |

**Purchase request:**
```json
{ "offerId": "...", "idempotencyKey": "<uuid>" }
```

**Idempotency:** Double-lock pattern — idempotency file lock (outer) → inventory file lock (inner). Prevents double-spend under concurrent requests.

### 2.5 Trading (`apps/meta-service/src/trades/`)

Peer-to-peer trades with escrow and dual approval.

**Flow:**
1. `POST /trades/propose` — Proposer locks items into escrow
2. `POST /trades/:id/counter` — Target adds counter-offer to escrow (optional)
3. `POST /trades/:id/approve` — Both parties must approve
4. Trade completes → items swapped; or expires after 24h → items returned

```ts
type TradeStatus = 'awaiting_counter' | 'awaiting_approval' | 'completed' | 'cancelled' | 'expired';
```

### 2.6 Audit Log (`apps/meta-service/src/audit/`)

Append-only JSONL at `data/audit.jsonl`. Logs: auth events, inventory changes, purchases, trade lifecycle. Never logs passwords.

### 2.7 Storage Layer (`apps/meta-service/src/storage/`)

File-based, no database.

| File | Contents |
|------|----------|
| `data/players.json` | All player accounts |
| `data/inventories/{playerId}.json` | Per-player inventory |
| `data/trades.json` | All trade records |
| `data/idempotency.json` | Purchase idempotency records |
| `data/audit.jsonl` | Audit log |
| `data/item_defs.json` | Static item catalog |
| `data/shop_offers.json` | Static shop offers |

**Safety:** atomic writes (temp → rename), per-file mutexes for concurrent access.

### 2.8 Environment Variables

| Var | Required | Default | Description |
|-----|----------|---------|-------------|
| `JWT_SECRET` | Yes | — | Min 16 chars |
| `PORT` | No | 3000 | |
| `HOST` | No | 0.0.0.0 | |
| `JWT_EXPIRY` | No | 7d | |
| `DATA_DIR` | No | ./data | |
| `NODE_ENV` | No | development | |

### 2.9 Meta UI (`apps/meta-ui/`)

React 18 admin/dev UI. Pages: Login, Register, Account, Inventory, Shop, Trades, ItemDefs, ItemDefDetail, Admin.

---

## 3. Shared Libraries

### `libs/shared` (`@org/shared`)

- `dungeon/types.ts` — All dungeon types (Entity, Tile, RunState, GameEvent, PlayerAction, ItemDef, etc.)
- `dungeon/grid.ts` — Grid utilities: `inBounds`, `getTile`, `isWall`, `getNeighbors`, `entityAt`, `neighbors8`, `DIR_TO_DELTA`
- `meta/types.ts` — All meta types (MetaItemDef, PlayerInventory, ShopOffer, TradeOffer, JwtPayload, etc.)

### `libs/items` (`@org/items`)

- `hammer.ts`, `rivet_gun.ts`, `remote_mine.ts` — Item activation modules
- `index.ts` — `ITEM_DEFS`, `META_DEFS`, `computeSlotView()`, `resolveItemActivation()`

---

## 4. What's Connected vs. Disconnected

| Connection | Status |
|-----------|--------|
| Dungeon runs ↔ meta accounts | **Not connected** — dungeon is anonymous in-memory sessions |
| Dungeon item drops → meta inventory | **Not connected** |
| Meta inventory → dungeon loadout | **Partially sketched** — `PlayerProfile` exists in RunState but not populated from meta |
| Meta auth → dungeon auth | **Not connected** |

### PlayerProfile (bridge type, partially implemented)

```ts
interface PlayerProfile {
  playerId: string;
  loadout: { A: SlotEntry | null, B: SlotEntry | null };
  inventory: { instances: Record<string, ItemInstance>, stacks: Record<string, number> };
}
```

This type exists in shared and is carried in `RunState`, but dungeon runs currently start with a hardcoded default profile rather than pulling from meta-service.

---

## 5. Extensibility Points

| What to add | Where |
|------------|-------|
| New item | `libs/items/src/` — implement `ItemDef`, export from `index.ts` |
| New AI behavior | `apps/dungeon-service/src/ai/` — implement function, register in `aiRegistry` |
| New tile type | Update `TileType` in `libs/shared`, add handling in engine |
| New effect | Add to `EFFECT_RULES` + `EFFECT_RESOLVERS` in `effects.ts` |
| New shop offer | Edit `data/shop_offers.json` + restart |
| New item definition | Edit `data/item_defs.json` + restart |
| New map preset | Add to `apps/dungeon-service/src/models/presets.ts` |
| New interactable kind | Add to `InteractableKind` union + handling in `mechanisms.ts` |

---

## 6. Key Design Decisions

- **Turn order is strict:** player → overclock → pickup → enemies → environment → item cooldowns → end check
- **Actions are always 200:** errors returned in response body, never as HTTP errors
- **WebSocket owns the clock:** server drives tick loop at `TICK_MS` regardless of client action rate; latest queued action wins
- **File-based persistence:** no external database; atomic writes + per-file mutexes
- **Idempotent purchases:** client provides UUID key; server deduplicates
- **Stateless JWT:** no server-side session store; logout is client-side only
- **Source-only libs:** `@org/shared` and `@org/items` have no build step; imported directly via path aliases
