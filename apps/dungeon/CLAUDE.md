# Dungeon Game — Clockwork Abyss

## Services & Ports

| Service | NX project | Port | Description |
|---------|-----------|------|-------------|
| `apps/dungeon/dungeon-service` | `dungeon-service` | 3001 | Fastify v5 HTTP+WS game server |
| `apps/dungeon/meta-service` | `meta-service` | 3000 | Fastify v5 auth/inventory/shop backend |
| `apps/dungeon/game` | `@org/game` | 4200 | React 18 + Vite browser client |
| `apps/dungeon/dungeon-ui-e2e` | `@org/dungeon-ui-e2e` | — | Playwright e2e |

## Libraries

| Package | Path | Contents |
|---------|------|----------|
| `@org/shared` | `libs/dungeon/shared/src/index.ts` | Shared types + grid utilities |
| `@org/items` | `libs/dungeon/items/src/index.ts` | Item modules, ITEM_DEFS, META_DEFS, helpers |

## Build & Run

- Services use esbuild CJS build: `node scripts/build.js && node dist/main.js`
- Must restart service after source changes: `/dev restart dungeon-service` or `/dev restart meta-service`
- E2E: `pnpm nx e2e dungeon-ui-e2e --no-tui` (use `--no-tui` in non-interactive environments)
- Health check endpoint: `GET /health` → 200 (use for e2e `reuseExistingServer`)

## Key Architecture

- `dungeon-service/src/engine/` — turn processing, reconcile patch
- `dungeon-service/src/storage/` — atomic-write, mutex-registry, outbox-store
- `meta-service/src/auth/` — JWT auth (requires `JWT_SECRET` env var, min 16 chars)
- `meta-service/src/inventory/`, `shop/`, `trades/` — item economy
- `meta-service/src/resolve/` — escrow resolution (`POST /runs/escrows/:escrowId/resolve`)
- `RunState` requires `startReceipt: StartReceipt`; optional `reconcilePatch?: ReconcilePatch`

## Testing Notes

- meta-service tests require `JWT_SECRET` env var or `handlers.spec.ts` fails
- Vitest pool: `pool: 'forks'` for Fastify integration tests
- Vitest config: use `vitest.config.mts` (not `.ts`) in CJS packages
- Node 18 + Fastify 5: needs `diagnostics_channel.tracingChannel` polyfill in vitest setup

## Deep Dives

- [`dungeon-service/CLAUDE.md`](dungeon-service/CLAUDE.md) — turn pipeline, AI, items, events, HTTP/WS API, storage
- [`meta-service/CLAUDE.md`](meta-service/CLAUDE.md) — auth, inventory, shop, trading, escrow resolution

## What's Connected vs. Disconnected

`SYSTEM_OVERVIEW.md` (now removed) claimed dungeon and meta were entirely disconnected. That's stale — an escrow/receipt/reconcile flow was added since then, though it's not fully wired end-to-end:

| Connection | Status |
|-----------|--------|
| Dungeon runs ↔ meta accounts | **Partially connected** — `POST /runs` accepts optional `playerId`/`escrowId`; a run is either meta-connected or anonymous ("bypass mode"), caller's choice |
| Ammo/consumables escrow → meta inventory (stack-level) | **Partially connected** — `POST /runs/escrows/:escrowId/resolve` correctly subtracts `consume.stacks` from the player's meta inventory when called, but dungeon-service has no automatic dispatch path in production: delivery only happens via the manual debug retry endpoint (`POST /debug/reconcile-outbox/:runId/retry`), which is disabled in production |
| Escrow instance-level consume/grant/durability | **Not connected** — `ReconcilePatchSchema` validates `consume.instances`, `grant.instances`, and `durabilityUpdates`, but `resolveEscrow` only applies `stacks`; the instance/durability data is accepted and stored but has no effect on inventory |
| Dungeon loot drops → meta inventory | **Not connected** — `reconcile.ts` always sends an empty `grant`; explicitly noted in code as "loot not wired yet" |
| Meta inventory → dungeon loadout | **Partially wired** — dungeon-service builds `startReceipt` from a `profile` in the `POST /runs` request body; it does not fetch inventory from meta-service itself, so the caller must supply it |
| Meta auth → dungeon auth | **Not connected** — the escrow resolve callback is explicitly unauthenticated service-to-service; dungeon-service routes don't require a meta-service JWT |

See [`dungeon-service/CLAUDE.md`](dungeon-service/CLAUDE.md) ("Meta Integration") and [`meta-service/CLAUDE.md`](meta-service/CLAUDE.md) ("Escrow Resolution") for the mechanics.

## Key Design Decisions

- Turn order is strict: player → overclock → pickup → enemies → environment → item cooldowns → end check
- Actions are always 200: errors returned in response body, never as HTTP errors
- WebSocket owns the clock: server drives tick loop at `TICK_MS` regardless of client action rate; latest queued action wins
- File-based persistence: no external database; atomic writes + per-file mutexes
- Idempotent purchases: client provides UUID key; server deduplicates
- Stateless JWT: no server-side session store; logout is client-side only
- Source-only libs: `@org/shared` and `@org/items` have no build step; imported directly via path aliases
