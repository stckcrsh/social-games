# Wrastlin Game

> Status: early setup — requirements in progress. Services are placeholders only.

## Services & Ports

| Service | NX project | Port | Description |
|---------|-----------|------|-------------|
| `apps/wrastlin/meta-service` | `wrastlin-service` | 3002 | Fastify auth/user management |
| `apps/wrastlin/game` | `@org/wrastlin-game` | TBD | React + Vite browser client |
| `apps/wrastlin/wrastlin-ui-e2e` | `@org/wrastlin-ui-e2e` | — | Playwright e2e |

## Libraries

| Package | Path | Contents |
|---------|------|----------|
| `@org/wrastlin-shared` | `libs/wrastlin/shared/src/index.ts` | Wrastlin-specific shared types |

Cross-game shared code lives in `libs/shared/`.

## Design Decisions

- Follows the same structure as `apps/dungeon/` — see that game for established patterns
- Each service gets its own esbuild CJS build (`node scripts/build.js`)
- Wrastlin-only types go in `libs/wrastlin/shared`; anything shared with dungeon goes in `libs/shared`
