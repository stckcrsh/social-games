---
description: Manage social-games dev services. Usage: /dev [start|stop|restart|status|logs] [service|all]
---

The user wants to manage dev services. Their request: $ARGUMENTS

Parse the request as: `<operation> [service]`

Valid operations: `start`, `stop`, `restart`, `status`, `logs`

Valid service names (also accept short aliases):
- `meta-game-service` / `mgs`   — Fastify API, port 3000
- `dungeon-engine`    / `de`    — Fastify + WS game server, port 3001
- `meta-game-ui`      / `mgu`   — React/Vite dev UI, port 4200
- `dungeon-ui`        / `du`    — React/Vite game client, port 4201
- `proxy`                       — Caddy reverse proxy
- `all`                         — applies the operation to all 5 services

Run the management script using the Bash tool:

```
bash /Users/tawneypauling/Documents/git/social-games/.claude/skills/dev/scripts/service.sh <operation> <service>
```

Examples:
- `/dev status`                       → bash .../service.sh status
- `/dev start all`                    → bash .../service.sh start all
- `/dev start dungeon-engine`         → bash .../service.sh start dungeon-engine
- `/dev stop mgs`                     → bash .../service.sh stop meta-game-service
- `/dev restart du`                   → bash .../service.sh restart dungeon-ui
- `/dev logs de`                      → bash .../service.sh logs dungeon-engine

After running, display the script's output clearly to the user.
For `start`/`restart`: if any service didn't come up, tail its log to show the error.
For `status`: show a clean table of which services are running and on which ports.
