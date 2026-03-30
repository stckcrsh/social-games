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
