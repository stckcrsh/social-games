# social-games

NX monorepo for **Clockwork Abyss** — a browser-based dungeon crawler with a server-authoritative meta-game layer.

## Packages

| Package | Description | Dev port |
|---|---|---|
| `dungeon-engine` | Fastify game server — HTTP REST + WebSocket | 3001 |
| `dungeon-ui` | React browser client for the dungeon game | 4201 |
| `meta-game-service` | Fastify backend — auth, inventory, shop | 3000 |
| `meta-game-ui` | React dev-tool UI for the meta-game service | 4200 |
| `proxy` | Caddy reverse proxy — single entry point for sharing | 8080 |

---

## Prerequisites

- [Node.js](https://nodejs.org) 20+
- [pnpm](https://pnpm.io) 9+
- [Caddy](https://caddyserver.com/docs/install) (only needed for the proxy / friend-sharing flow)

```bash
# macOS
brew install caddy

# Install JS dependencies
pnpm install
```

---

## Local development

Each service runs independently. Start whichever you need:

```bash
pnpm nx serve dungeon-engine        # game server  → http://localhost:3001
pnpm nx serve dungeon-ui            # game client  → http://localhost:4201
pnpm nx serve meta-game-service     # meta server  → http://localhost:3000
pnpm nx serve meta-game-ui          # meta UI      → http://localhost:4200
```

`meta-game-service` requires a JWT secret:

```bash
JWT_SECRET=your-secret-here pnpm nx serve meta-game-service
```

The dungeon-ui talks directly to `localhost:3001` in dev. No proxy needed.

---

## Sharing with friends (proxy)

The `proxy` package exposes everything through a single port (8080) so you can share one URL — via [ngrok](https://ngrok.com), [Tailscale Funnel](https://tailscale.com/kb/1223/funnel), or any tunnel.

### Architecture

```
tunnel URL → :8080 (Caddy)
  /              → dungeon-ui built files
  /meta-ui/      → meta-game-ui built files
  /api/dungeon/* → localhost:3001 (dungeon-engine)
  /api/meta/*    → localhost:3000 (meta-game-service)
```

WebSocket upgrades (used by the game client) are handled transparently by Caddy on the `/api/dungeon/*` route.

### Step 1 — Build the UIs for production

```bash
pnpm nx build dungeon-ui
pnpm nx build meta-game-ui
```

Build output goes to:
- `packages/dungeon-ui/dist/` (dungeon game)
- `dist/packages/meta-game-ui/` (meta-game dev tool)

### Step 2 — Start the backends

```bash
# Terminal 1
pnpm nx serve dungeon-engine

# Terminal 2
JWT_SECRET=your-secret-here pnpm nx serve meta-game-service
```

### Step 3 — Start the proxy

```bash
# Terminal 3
pnpm nx serve proxy
```

Caddy listens on `http://localhost:8080`. Verify locally first:

- `http://localhost:8080` → dungeon game lobby
- `http://localhost:8080/meta-ui/` → meta-game dev tool

### Step 4 — Open a tunnel

```bash
# ngrok
ngrok http 8080

# or Tailscale Funnel
tailscale funnel 8080
```

Share the printed URL with your friends.

### Verification checklist

1. `http://localhost:8080` renders the dungeon game lobby
2. Pick a preset → Start Game → the grid renders
3. Open the browser Network tab: a WebSocket to `/api/dungeon/runs/<id>/ws` should show **Status 101**
4. Arrow keys move the player; `e` interacts with levers
5. `http://localhost:8080/meta-ui/` renders the meta-game dev tool and API calls succeed

---

## Running tests

```bash
pnpm nx test dungeon-engine
NODE_ENV=test JWT_SECRET=test-secret-at-least-16-chars pnpm nx test meta-game-service
```

---

## Further reading

- [`packages/dungeon-engine/API.md`](packages/dungeon-engine/API.md) — dungeon engine HTTP + WebSocket API reference
- [`packages/dungeon-engine/CLI.md`](packages/dungeon-engine/CLI.md) — interactive CLI for the dungeon engine
- [`packages/meta-game-service/README.md`](packages/meta-game-service/README.md) — meta-game service API reference
