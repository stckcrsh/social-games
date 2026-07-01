# Meta Service — Deep Dive

NX project: `meta-service` | Port: 3000 | Fastify v5 auth/inventory/shop backend (internally: *Clockwork Abyss*)

For service list, ports, and build/run commands see [`apps/dungeon/CLAUDE.md`](../CLAUDE.md).

Auth primitives (Zod schemas, bcrypt hashing, atomic file writes, per-file mutexes, players store) are not
implemented locally — `src/auth/`, `src/storage/mutex-registry.ts`, `src/storage/atomic-write.ts`,
`src/storage/file-store.ts`, and `src/storage/players-store.ts` all re-export from the cross-game shared
library `@org/auth` (`libs/shared/auth`). If you're hunting for the actual implementation of one of these,
look there, not in this app.

## Auth (`src/auth/`)

Stateless JWT (bcrypt passwords, no token blocklist).

| Route | Description |
|-------|-------------|
| `POST /auth/register` | Create account (username 3-32 chars, alnum/underscore/hyphen; password 8-128 chars) |
| `POST /auth/login` | Returns JWT (default 7d expiry) |
| `POST /auth/logout` | Client-side only (stateless); audit-logs `player.logout` |
| `POST /auth/change-password` | Requires current password |
| `POST /auth/admin/reset-password` | Admin only |

JWT payload: `{ playerId, username, roles: ('player' | 'admin')[] }`

Failed logins are audit-logged as `player.login_failed` (no password data ever logged).

## Item Definitions (`src/content/`)

Catalog loaded once at startup (`loadContent`, `src/content/loader.ts`) by merging two sources:

- `data/item_defs.json` — static JSON catalog (validated against `ItemDefsFileSchema`)
- `META_DEFS` from `@org/items` (`libs/dungeon/items`) — the dungeon-run item module definitions, spread in
  **after** the JSON defs, so a `META_DEFS` entry wins on a colliding `defId`

So the effective item catalog is not purely the JSON file — it's JSON defs + shared dungeon item metadata.

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
| `GET /content/item-defs` | All definitions (merged catalog) |
| `GET /content/item-defs/:defId` | Single definition, 404 if unknown |

## Inventory (`src/inventory/`)

Per-player inventory: instances (unique UUID items, e.g. gear) and stacks (integer quantity by defId, e.g. materials/currency).

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

All three mutation routes require `roles.includes('admin')` and are audit-logged (`inventory.grant` /
`inventory.burn` / `inventory.transfer`).

## Shop (`src/shop/`)

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

**Note:** `stock`, `limitPerPlayer`, `availability`, and `requires` are part of the `ShopOffer` shape (shared
type in `@org/shared`) but `src/shop/service.ts` does not currently read or enforce any of them — `purchase()`
only checks price affordability and applies `grant`. Don't assume stock limits or role/unlock gating are live;
verify against `service.ts` before relying on them.

`purchase()` returns `status: 'success' | 'insufficient_funds' | 'offer_not_found'`. Only `success` is recorded
in the idempotency store (`insufficient_funds` is retryable) and audit-logged as `shop.purchase`.

Idempotency: double-lock pattern — idempotency file lock (outer, keyed on `data/idempotency.json`) → inventory
file lock (inner, `data/inventories/{playerId}.json`). Prevents double-spend under concurrent requests.

## Trading (`src/trades/`)

Peer-to-peer trades with escrow and dual approval.

| Route | Description |
|-------|-------------|
| `POST /trades` | Proposer locks items into escrow (status → `awaiting_counter`) |
| `POST /trades/:tradeId/counter` | Target adds counter-offer to escrow (status → `awaiting_approval`) |
| `POST /trades/:tradeId/approve` | Either party approves; completes once both have approved |
| `POST /trades/:tradeId/cancel` | Either party cancels while `awaiting_counter` or `awaiting_approval`; returns escrowed items |
| `GET /trades` | List own trades, bucketed into `{ incoming, outgoing, history }` |
| `GET /trades/:tradeId` | Single trade detail (403 if not a party to it) |

Trades expire 24h after proposal (`TRADE_TTL_MS`) if not completed/cancelled; expiry is checked lazily on the
next `counter`/`approve` call (or reflected as `expired` in `GET /trades` list output) and returns escrowed
items to their owner(s).

```ts
type TradeStatus = 'awaiting_counter' | 'awaiting_approval' | 'completed' | 'cancelled' | 'expired';
```

Trade lifecycle audit actions: `trade.propose`, `trade.counter`, `trade.approve`, `trade.complete` (on the
approve call that completes the trade), `trade.cancel`.

## Escrow Resolution (`src/resolve/`)

Bridges dungeon-service run outcomes to meta inventory. `POST /runs/escrows/:escrowId/resolve` — service-to-service, **no auth required**. Called by dungeon-service when a meta-connected run ends (see `apps/dungeon/dungeon-service/CLAUDE.md` "Meta Integration").

- Body is validated against `ReconcilePatchSchema` (Zod), then `escrowId` from the URL param is attached.
- `resolveEscrow(dataDir, patch)` (`service.ts`) is idempotent: it hashes the patch (`runId` + `result` + `consume` + `grant`, sha256, truncated to 16 chars) and stores it in `data/escrow_resolves.json` keyed by `escrowId`.
  - If the same `escrowId` resolves again with an identical hash → `{ status: 'deduped' }`, audit-logged as `run.resolve_dedup`.
  - If the same `escrowId` resolves again with a **different** hash → `409` (`Escrow already resolved with different patch`) — prevents a stale/duplicate reconcile from double-applying.
  - Otherwise (first resolve), and only when `patch.playerId` is present: subtracts `patch.consume.stacks` and adds `patch.grant.stacks` on the player's inventory (`data/inventories/{playerId}.json`) under that inventory file's own lock, then records the resolve and audit-logs `run.resolve`.
  - **Only `stacks` are applied.** `patch.consume.instances`, `patch.grant.instances`, and `patch.durabilityUpdates` are present in `ReconcilePatchSchema` but are not currently read by `resolveEscrow` — instance-level consume/grant/durability from a run is accepted and validated but has no effect on inventory yet.
  - If `patch.playerId` is absent, no inventory mutation happens at all — the resolve is just recorded (useful for e.g. "abandoned" runs with nothing to reconcile).

### Admin (`src/admin/`)

Escrow-record admin/debug routes, prefix `/admin`, all requiring `roles.includes('admin')`:

| Route | Description |
|-------|-------------|
| `GET /admin/escrows/:escrowId` | Read the stored resolve record (404 if none) |
| `GET /admin/escrows/:escrowId/resolve` | Alias of the above |
| `POST /admin/escrows/:escrowId/reset` | Deletes the resolve record so a run can be re-resolved during testing; **403 in production** (`config.NODE_ENV === 'production'`) |

## Audit Log (`src/audit/`)

Append-only JSONL at `data/audit.jsonl`, one write per call guarded by a per-file mutex. Covers auth
(`player.register`, `player.login`, `player.login_failed`, `player.logout`, `player.password_change`,
`admin.password_reset`), inventory (`inventory.grant`, `inventory.burn`, `inventory.transfer`), shop
(`shop.purchase`), trade lifecycle (`trade.propose`, `trade.counter`, `trade.approve`, `trade.cancel`,
`trade.complete`), and escrow resolution (`run.resolve`, `run.resolve_dedup`). Never logs passwords.

## Storage Layer (`src/storage/`)

File-based, no database.

| File | Contents |
|------|----------|
| `data/players.json` | All player accounts |
| `data/inventories/{playerId}.json` | Per-player inventory |
| `data/trades.json` | All trade records |
| `data/idempotency.json` | Purchase idempotency records |
| `data/escrow_resolves.json` | Escrow resolve records (see Escrow Resolution above) |
| `data/audit.jsonl` | Audit log |
| `data/item_defs.json` | Static item catalog (JSON half of the merged catalog) |
| `data/shop_offers.json` | Static shop offers |

Safety: atomic writes (temp → rename), per-file mutexes for concurrent access. `players.json`, `idempotency.json`,
`trades.json`, and `escrow_resolves.json` are auto-created empty on first boot (`main.ts`); `item_defs.json` and
`shop_offers.json` must already exist since content loading fails if they're missing.

## Environment Variables

| Var | Required | Default | Description |
|-----|----------|---------|--------------|
| `JWT_SECRET` | Yes | — | Min 16 chars |
| `PORT` | No | 3000 | |
| `HOST` | No | 0.0.0.0 | |
| `JWT_EXPIRY` | No | 7d | |
| `DATA_DIR` | No | `./data` (relative to service dist dir) | |
| `NODE_ENV` | No | development | Must be `production` to disable `/admin/escrows/:escrowId/reset` |

## Client UI Pages (`apps/dungeon/game/src/pages/`)

Meta-service's UI surface lives in the shared `apps/dungeon/game` client, alongside (but separate from) the
dungeon-crawl UI. These pages talk to meta-service exclusively via `src/api/meta.ts`:

| Page | Route | Talks to |
|------|-------|----------|
| `LoginPage.tsx` | `/login` | `POST /auth/login` |
| `RegisterPage.tsx` | `/register` | `POST /auth/register` |
| `AccountPage.tsx` | `/account` | `POST /auth/change-password` |
| `InventoryPage.tsx` | `/inventory` (default route) | `GET /players/me/inventory` |
| `ShopPage.tsx` | `/shop` | `GET /shop/offers`, `POST /shop/purchase` |
| `TradesPage.tsx` | `/trades` | `/trades*` routes |
| `ItemDefsPage.tsx` | `/content/items` | `GET /content/item-defs` |
| `ItemDefDetailPage.tsx` | `/content/items/:defId` | `GET /content/item-defs/:defId` |
| `AdminPage.tsx` | `/admin` (requires admin role) | `/auth/admin/*`, `/players/me/inventory/{grant,burn,transfer}` |

The dungeon-crawl side of the client (`GamePage` in `apps/dungeon/game/src/game/Game.tsx`, plus
`LoadoutPage.tsx`, `ResultsPage.tsx`, and `DebugPage.tsx` — also under `src/pages/`) talks to dungeon-service
instead; see [`dungeon-service/CLAUDE.md`](../dungeon-service/CLAUDE.md) ("Client Rendering").

## Extensibility Points

| What to add | Where |
|------------|-------|
| New shop offer | Edit `data/shop_offers.json` (validated against `ShopOffersFileSchema` in `src/content/schemas.ts` on load), restart service |
| New item definition | Edit `data/item_defs.json` (validated against `ItemDefsFileSchema` in `src/content/schemas.ts` on load), restart service — or add it to `@org/items` instead if it's a dungeon-run item (see `dungeon-service/CLAUDE.md` "Extensibility Points"), since `META_DEFS` wins on a colliding `defId` |
| New audit action | Add a call to `auditLog()` at the relevant route/service (`src/audit/`) |
| New admin route | `src/admin/` — gate with `roles.includes('admin')` |
