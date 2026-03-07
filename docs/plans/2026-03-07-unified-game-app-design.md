# Unified Game App Design

**Date:** 2026-03-07
**Status:** Approved

## Goal

Merge `meta-ui` and `dungeon-ui` into a single React SPA (`apps/game`). Add a proper pre-run loadout picker, a post-run results page, a dev-only debug launcher, and lazy room loading so a large multi-room world can be authored in Tiled without code changes per room.

---

## 1. App Structure

New Nx app: `apps/game` (React 18 + Vite, port 4200). Both `apps/meta-ui` and `apps/dungeon-ui` are deleted. The new app talks to both `dungeon-service` (port 3001) and `meta-service` (port 3000).

### Routes

| Route | Description |
|---|---|
| `/login` | Auth — login |
| `/register` | Auth — register |
| `/inventory` | Owned items; "Play" button → `/loadout` |
| `/shop` | Buy items |
| `/trades` | Trade proposals |
| `/account` | Player profile |
| `/admin` | Admin tools (requires admin role) |
| `/loadout` | **New** — pick run loadout from owned inventory |
| `/game/:runId` | **New** — game canvas |
| `/results/:runId` | **New** — post-run summary |
| `/debug` | **New** — dev-only debug launcher |

### Proxy

Caddy updated: single app served at `/`. `dungeon-ui-e2e` updated to point at `apps/game`.

---

## 2. Run Flow

### Loadout page (`/loadout`)

- Fetches player inventory from meta-service
- Shows only owned items for slot A and slot B selection
- Ammo quantity input (capped by owned stack qty)
- Confirm → `POST /runs` to dungeon-service → escrows items, creates run in **`pending`** status → navigate to `/game/:runId`

### Game page (`/game/:runId`)

- Connects WebSocket to `/runs/:runId/ws` immediately on mount
- While status is `pending`: shows a **"Ready" screen** (extensible — future: co-op lobby, item preview)
- Player clicks **Start** → WS sends `{ type: 'start' }` → server transitions `pending → active` → tick loop begins
- Gameplay proceeds as today (keyboard actions over WS, state pushed back)
- On status `dead` or `extracted`: navigate to `/results/:runId`

### Server-side changes for pending state

- `RunState.status` gains `'pending'` as a valid value (before `'active'`)
- `POST /runs` returns a run in `pending` status
- WS handler: `{ type: 'start' }` action transitions `pending → active` and begins accepting game actions
- Debug mode skips pending: `POST /runs` with `{ debug: true }` (or `metaMode: 'bypass'`) starts `active` immediately

### Results page (`/results/:runId`)

Fetches reconcile patch from `GET /runs/:runId/reconcile-patch`. Displays:

- Result badge: **Extracted** / **Dead**
- Items brought in (from `startReceipt`)
- Items lost (from `reconcilePatch.consume`)
- Items found / looted (from `reconcilePatch.grant`)
- Button → `/inventory`

---

## 3. Debug Route (`/debug`)

Only rendered when `import.meta.env.DEV` is true — otherwise redirects to `/`.

### Controls

- **Map selector** — dropdown of all preset/map IDs (hardcoded list matching presets.ts + known TMX room IDs)
- **Slot A / Slot B** — free item picker (all items, no inventory restriction)
- **Ammo qty** — number input
- **Start** → `POST /runs` with `metaMode: 'bypass'`, selected preset, chosen loadout → navigate to `/game/:runId`

### In-game debug additions (when run was created via `/debug`)

- **Step Tick** button (existing)
- **Auto-tick toggle** — fires ticks on a 500ms interval when enabled

Debug runs skip the `pending` state — run is `active` immediately.

---

## 4. World Map & Lazy Room Loading

### File layout

All TMX room files live in `apps/game/public/tiles/`. Each file = one room. Naming convention: `room-<id>.tmx` (e.g. `room-entrance.tmx`, `room-corridor.tmx`, `room-vault.tmx`).

### World preset

New entry in `presets.ts` with id `'world'`. Starting room: `room-entrance`. `currentRoomId: 'room-entrance'`. No rooms pre-loaded — all loaded lazily.

### Lazy loading

`checkPortalTransition` in `turn.ts` currently warns and stays if `state.rooms[targetMapId]` is absent. Change: on missing target room, call `loadRoomFromTmx(targetMapId)` which:

1. Reads `room-<targetMapId>.tmx` from the tiles directory
2. Parses it with `parseTmxObjects` (existing)
3. Builds a `RoomState`: grid from string layout or a blank floor (TBD — see note), enemies from TMX `enemies` layer, mechanisms from preset's `mechanisms` array if any, pendingExplosions: []
4. Populates `state.rooms[targetMapId]` before continuing the transition

> **Note:** TMX tile layers are visual-only and rendered client-side. The server needs a way to build the grid (walls/floors) for new rooms. Options:
> - Embed a simple wall layout in the TMX as a separate encoded layer that the server also parses
> - Or keep a thin server-side room definition (just the wall grid as a string) alongside the TMX
> This is a detail for the implementation plan to resolve.

### Room authoring

Adding a new room = add a TMX file + reference it in another room's portal. No code changes. See `docs/map-authoring.md` for the object layer spec.

---

## What Changes

| Component | Before | After |
|---|---|---|
| `apps/meta-ui` | Standalone React app | **Deleted** — merged into `apps/game` |
| `apps/dungeon-ui` | Standalone React app | **Deleted** — merged into `apps/game` |
| `apps/game` | Does not exist | **New** unified SPA |
| `packages/proxy/Caddyfile` | Routes to two UI apps | Routes to one UI app |
| `RunState.status` | `'active' \| 'dead' \| 'extracted'` | Adds `'pending'` |
| WS handler | Accepts game actions immediately | Requires `start` action before game actions |
| Room loading | Warns if target room missing | Lazily loads from TMX on first visit |
| Debug mode | Toggle in Lobby | Dedicated `/debug` route (dev only) |
| Post-run | Dungeon-UI shows summary inline | `/results/:runId` page in unified app |
| Loadout selection | Free pick in Dungeon-UI Lobby | Inventory-restricted in `/loadout` page |
