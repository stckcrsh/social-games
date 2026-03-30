# Wrastlin Game — Initial Folder Structure Design

**Date:** 2026-03-09

## Overview

Add a new social game, "Wrastlin", to the monorepo following the same structure as the dungeon game.

## Folder Structure

```
apps/wrastlin/
  game/              — React + Vite UI (scaffolded when requirements are ready)
  meta-service/      — Fastify auth/user management service
  wrastlin-ui-e2e/   — Playwright e2e tests

libs/wrastlin/
  shared/            — @org/wrastlin-shared: wrastlin-specific shared types
```

Cross-game shared code (e.g. shared auth logic) will live in `libs/shared/` when needed.

## Workspace Changes

Add to `pnpm-workspace.yaml`:
```yaml
  - 'apps/wrastlin/*'
  - 'libs/wrastlin/*'
```

## Package Names

| Folder | Package name |
|--------|-------------|
| `apps/wrastlin/game` | `@org/wrastlin-game` |
| `apps/wrastlin/meta-service` | `@org/wrastlin-meta-service` |
| `apps/wrastlin/wrastlin-ui-e2e` | `@org/wrastlin-ui-e2e` |
| `libs/wrastlin/shared` | `@org/wrastlin-shared` |

## Decisions

- Each wrastlin service/app is self-contained under `apps/wrastlin/`
- Wrastlin gets its own meta-service (auth/users) — can be consolidated with dungeon's later if needed
- `libs/wrastlin/shared` holds wrastlin-only types; `libs/shared` is the cross-game lib
- Only placeholder `package.json` files created now — full scaffolding deferred until requirements are finalized
