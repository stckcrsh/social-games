# social-games

NX monorepo hosting two independent games. Package manager: `pnpm`.

## Games

| Game | Location | Docs |
|------|----------|------|
| **Wrastlin** — weekly wrestling manager game | `apps/wrastlin/` | [`apps/wrastlin/CLAUDE.md`](apps/wrastlin/CLAUDE.md) |
| **Dungeon (Clockwork Abyss)** — real-time dungeon crawler | `apps/dungeon/` | [`apps/dungeon/CLAUDE.md`](apps/dungeon/CLAUDE.md) |

Each game's `CLAUDE.md` covers its services, ports, build/run commands, and links to deeper technical docs. Shared cross-game code lives in `libs/shared/`.

## Prerequisites

- [Node.js](https://nodejs.org) 24+
- [pnpm](https://pnpm.io) 10+
- [Caddy](https://caddyserver.com/docs/install) (only needed for the proxy / friend-sharing flow)

```bash
# macOS
brew install caddy

# Install JS dependencies
pnpm install
```

## Local development

See each game's `CLAUDE.md` for exact serve commands and required environment variables. Quick reference:

```bash
# Dungeon
pnpm nx serve dungeon-service     # game server  → http://localhost:3001
pnpm nx serve meta-service        # meta server  → http://localhost:3000
pnpm nx serve @org/game           # game client  → http://localhost:4200

# Wrastlin
pnpm nx serve wrastlin-service    # API server   → http://localhost:3002
pnpm nx serve wrastlin-game       # player UI    → http://localhost:4300
```

## Sharing with friends (proxy)

The `apps/proxy` package (Caddy) exposes the dungeon backends and game client through a single port (8080) so you can share one URL via a tunnel (ngrok, Tailscale Funnel).

```bash
# Terminal 1-2: start the dungeon backends
pnpm nx serve dungeon-service
pnpm nx serve meta-service

# Terminal 3: start the proxy (reads apps/proxy/Caddyfile)
pnpm nx serve @org/proxy

# Terminal 4: open a tunnel to the proxy
ngrok http 8080
# or: tailscale funnel 8080
```

`apps/proxy/Caddyfile` routes `/api/dungeon/*` → `localhost:3001`, `/api/meta/*` → `localhost:3000`, and everything else → `localhost:4200` (the Vite dev server), upgrading WebSockets automatically.

## Running tests

```bash
pnpm nx test dungeon-service
pnpm nx test wrastlin-service
pnpm nx run-many -t test          # everything
```

Some services require env vars for tests — see the relevant game's `CLAUDE.md` (`JWT_SECRET` is the common one, min 16 chars).
