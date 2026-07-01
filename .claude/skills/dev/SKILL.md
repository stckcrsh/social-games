---
description: Manage social-games dev services. Usage: /dev [start|stop|restart|status|logs] [service|all]
---

The user wants to manage dev services. Their request: $ARGUMENTS

Parse the request as: `<operation> [service]`

Valid operations: `start`, `stop`, `restart`, `status`, `logs`

Valid service names (also accept short aliases):
- `meta-service`      / `ms`    — Fastify API, port 3000 (dungeon economy)
- `dungeon-service`   / `ds`    — Fastify + WS game server, port 3001
- `game`              / `g`     — React/Vite dungeon client, port 4200
- `proxy`                       — Caddy reverse proxy
- `all`                         — applies the operation to all 4 dungeon services

Note: Wrastlin services (`wrastlin-service`, `wrastlin-game`) are not managed by this
script — start them directly with `pnpm nx serve wrastlin-service` /
`pnpm nx serve wrastlin-game` per `apps/wrastlin/CLAUDE.md`.

Run the management script using the Bash tool:

```
bash /Users/tawneypauling/Documents/git/social-games/.claude/skills/dev/scripts/service.sh <operation> <service>
```

Examples:
- `/dev status`                       → bash .../service.sh status
- `/dev start all`                    → bash .../service.sh start all
- `/dev start dungeon-service`        → bash .../service.sh start dungeon-service
- `/dev stop ms`                      → bash .../service.sh stop meta-service
- `/dev restart g`                    → bash .../service.sh restart game
- `/dev logs ds`                      → bash .../service.sh logs dungeon-service

After running, display the script's output clearly to the user.
For `start`/`restart`: if any service didn't come up, tail its log to show the error.
For `status`: show a clean table of which services are running and on which ports.
