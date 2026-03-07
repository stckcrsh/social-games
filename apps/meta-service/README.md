# meta-game-service

Server-authoritative backend for **Clockwork Abyss** — designed to be reused across games. Manages player accounts, static item/shop content, per-player inventories, and an offer-driven shop with atomic idempotent purchases.

Persistence is flat-file JSON/JSONL. No database required.

---

## Quick start

```bash
# Install dependencies (from workspace root)
pnpm install

# Start the server
JWT_SECRET=your-secret-here pnpm nx serve meta-game-service
```

The server starts on `http://0.0.0.0:3000` by default.

### Environment variables

| Variable | Required | Default | Description |
|---|---|---|---|
| `JWT_SECRET` | Yes | — | Secret used to sign JWTs. Min 16 characters. |
| `PORT` | No | `3000` | Port to listen on |
| `HOST` | No | `0.0.0.0` | Host to bind to |
| `JWT_EXPIRY` | No | `7d` | JWT expiry (e.g. `1h`, `7d`) |
| `DATA_DIR` | No | `./data` | Directory for all data files |
| `NODE_ENV` | No | `development` | `development`, `production`, or `test` |

---

## Running tests

```bash
NODE_ENV=test JWT_SECRET=test-secret-at-least-16-chars pnpm nx test meta-game-service
```

---

## API overview

The full OpenAPI spec is at [`openapi.yaml`](./openapi.yaml). You can load it into [Swagger Editor](https://editor.swagger.io) or any OpenAPI-compatible tool.

All endpoints that require authentication expect:
```
Authorization: Bearer <token>
```

### Auth

| Method | Path | Auth | Description |
|---|---|---|---|
| `POST` | `/auth/register` | None | Create a new player account |
| `POST` | `/auth/login` | None | Login — returns a JWT |
| `POST` | `/auth/logout` | Bearer | Acknowledge logout (token is stateless; invalidate client-side) |
| `POST` | `/auth/change-password` | Bearer | Change your own password |
| `POST` | `/auth/admin/reset-password` | Bearer (admin) | Reset any player's password |

#### Register
```http
POST /auth/register
Content-Type: application/json

{
  "username": "alice",        // 3–32 chars, alphanumeric/underscore/hyphen
  "password": "hunter2hunter2",  // 8–128 chars
  "displayName": "Alice"     // optional
}
```
Returns `201` with `{ playerId, username }`.

#### Login
```http
POST /auth/login
Content-Type: application/json

{ "username": "alice", "password": "hunter2hunter2" }
```
Returns `{ token, playerId, username }`. Use `token` as your Bearer token.

#### Change password
```http
POST /auth/change-password
Authorization: Bearer <token>
Content-Type: application/json

{ "currentPassword": "hunter2hunter2", "newPassword": "correcthorsebatterystaple" }
```

#### Admin reset password
Requires the caller's JWT to contain the `admin` role.
```http
POST /auth/admin/reset-password
Authorization: Bearer <admin-token>
Content-Type: application/json

{ "targetUsername": "bob", "newPassword": "temporarypass1" }
```

> **Granting admin role:** Edit `data/players.json` directly and change `"roles": ["player"]` to `"roles": ["player", "admin"]`. The next login will issue a token with the admin role.

---

### Content

Static data loaded from JSON files at startup. No auth required.

| Method | Path | Description |
|---|---|---|
| `GET` | `/content/item-defs` | All item definitions |
| `GET` | `/content/item-defs/:defId` | Single item definition |

```http
GET /content/item-defs/brass_dagger
```
```json
{
  "defId": "brass_dagger",
  "name": "Brass Dagger",
  "category": "gear",
  "rarity": "common",
  "stackable": false,
  "maxStack": 1,
  "description": "A starter weapon.",
  "effects": { "damage": 8, "speed": 1.4 },
  "tradeable": true
}
```

---

### Inventory

Inventories are created lazily on first access. Two item storage modes:

- **Stacks** — stackable items stored as `{ defId: quantity }`. Efficient for currencies and consumables.
- **Instances** — non-stackable items stored as individual objects with a unique `itemId`. Supports per-item state (durability, mods).

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET` | `/players/me/inventory` | Bearer | View your own inventory |
| `POST` | `/players/me/inventory/grant` | Bearer (admin) | Grant items/currency to a player |
| `POST` | `/players/me/inventory/burn` | Bearer (admin) | Remove items from a player |
| `POST` | `/players/me/inventory/transfer` | Bearer (admin) | Move items between two players |

#### View inventory
```http
GET /players/me/inventory
Authorization: Bearer <token>
```
```json
{
  "playerId": "...",
  "stacks": { "scrap": 350, "repair_potion": 2 },
  "instances": {
    "aaaa-...": { "itemId": "aaaa-...", "defId": "brass_dagger", "createdAt": "..." }
  }
}
```

#### Grant items (admin)
```http
POST /players/me/inventory/grant
Authorization: Bearer <admin-token>
Content-Type: application/json

{
  "playerId": "<target-player-id>",
  "items": [
    { "kind": "stack", "defId": "scrap", "qty": 500 },
    { "kind": "instance", "defId": "brass_dagger", "qty": 1 }
  ]
}
```
- `kind: "stack"` — adds `qty` to the player's stack for that `defId`
- `kind: "instance"` — mints `qty` new unique item instances (each gets a fresh UUID)

#### Burn items (admin)
```http
POST /players/me/inventory/burn
Authorization: Bearer <admin-token>
Content-Type: application/json

{
  "playerId": "<target-player-id>",
  "items": [
    { "kind": "stack", "defId": "scrap", "qty": 50 },
    { "kind": "instance", "itemId": "<specific-item-uuid>" }
  ]
}
```
Returns `400` if the player doesn't have enough of a stack or the instance doesn't exist.

#### Transfer items (admin)
```http
POST /players/me/inventory/transfer
Authorization: Bearer <admin-token>
Content-Type: application/json

{
  "fromPlayerId": "<source-uuid>",
  "toPlayerId": "<dest-uuid>",
  "items": [
    { "kind": "stack", "defId": "scrap", "qty": 100 }
  ]
}
```
Returns `{ from: PlayerInventory, to: PlayerInventory }`.

---

### Shop

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET` | `/shop/offers` | None | List all shop offers |
| `POST` | `/shop/purchase` | Bearer | Purchase an offer |

#### List offers
```http
GET /shop/offers
```

#### Purchase (idempotent)
```http
POST /shop/purchase
Authorization: Bearer <token>
Content-Type: application/json

{
  "offerId": "offer_brass_dagger",
  "idempotencyKey": "<client-generated-uuid>"
}
```
```json
{
  "status": "success",
  "transactionId": "...",
  "offerId": "offer_brass_dagger",
  "idempotencyKey": "..."
}
```

**`status` values:**

| Status | Meaning |
|---|---|
| `success` | Price deducted, items granted |
| `insufficient_funds` | Player lacked the required items. Not stored — retry with the same key once you have funds |
| `offer_not_found` | `offerId` does not exist |

**Idempotency:** Generate a unique `idempotencyKey` per intended purchase (a UUID works well). If you replay the same key, you get the original `transactionId` back and the player is not charged again. This is safe to use on network retries.

---

## Data files

```
data/
├── item_defs.json      # Static item catalogue (committed)
├── shop_offers.json    # Static shop offers (committed)
├── players.json        # Runtime player accounts (gitignored, auto-created)
├── idempotency.json    # Runtime purchase records (gitignored, auto-created)
├── audit.jsonl         # Runtime audit log (gitignored, auto-created)
└── inventories/        # Per-player inventory files (gitignored, auto-created)
```

### Adding items for a new game

Edit `data/item_defs.json` — add an entry following the existing schema:

```json
{
  "my_new_item": {
    "defId": "my_new_item",
    "name": "My New Item",
    "category": "gear",
    "rarity": "rare",
    "stackable": false,
    "maxStack": 1,
    "description": "Does something cool.",
    "effects": { "myKey": 42 },
    "tradeable": true
  }
}
```

Restart the server. The item is immediately available via `/content/item-defs` and can be granted/sold.

### Adding shop offers

Edit `data/shop_offers.json`:

```json
{
  "offer_my_item": {
    "offerId": "offer_my_item",
    "title": "My New Item",
    "description": "Buy it with scrap.",
    "price": [{ "defId": "scrap", "qty": 100 }],
    "grant": [{ "kind": "instance", "defId": "my_new_item", "qty": 1 }],
    "stock": "infinite",
    "availability": { "kind": "always" }
  }
}
```

`stock` can be `"infinite"` or `{ "kind": "limited", "remaining": 10 }`.

---

## Architecture notes

- **Auth** — stateless JWT. There is no token blocklist; logout is client-side. Tokens expire per `JWT_EXPIRY`.
- **Storage** — one JSON file per concern. Per-file mutexes guarantee write safety under concurrent load without a database.
- **Atomic writes** — all writes go to a temp file first, then rename (POSIX atomic on the same filesystem).
- **Shop purchases** — double-lock pattern: idempotency file lock (outer) → inventory file lock (inner). Prevents double-spend and duplicate grants even under concurrent requests with the same key.
- **Audit log** — every auth, inventory, and purchase event is appended to `audit.jsonl` as newline-delimited JSON. Never contains passwords.
