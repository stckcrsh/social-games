# Dungeon Engine CLI

An interactive terminal client for playing the dungeon engine in real time.

## Prerequisites

The server must be running before launching the CLI:

```bash
pnpm nx serve dungeon-engine
```

## Launch

```bash
pnpm nx cli dungeon-engine
```

The CLI connects to `http://localhost:3001` by default. Override with the `DUNGEON_URL` env var:

```bash
DUNGEON_URL=http://localhost:4000 pnpm nx cli dungeon-engine
```

---

## Main Menu

```
? What would you like to do?
  New run
  List session runs
  Quit
```

| Option | Description |
|---|---|
| **New run** | Pick a map preset and start a game |
| **List session runs** | View and resume runs started in this session |
| **Quit** | Exit the CLI |

---

## Starting a Run

Select **New run** and choose a preset:

| Preset | Map | Enemies |
|---|---|---|
| `default` | 20×20 with a walled room | chaser, patrol, charger |
| `open` | 20×20, sparse walls | 2 chasers |
| `maze` | 20×20, dense corridors | 2 chasers |

The game starts immediately after picking a preset.

---

## In-Game Controls

Movement is driven by the server's beat clock (1 tick per second by default). Press a key before the next tick to queue your move — only the last key before the tick counts.

| Key | Action |
|---|---|
| `↑` | Move north |
| `↓` | Move south |
| `→` | Move east |
| `←` | Move west |
| `W` | Attack north |
| `S` | Attack south |
| `D` | Attack east |
| `A` | Attack west |
| `e` | Interact (current tile or adjacent) |
| `q` / `ESC` / `Ctrl-C` | Quit to main menu |

The grid refreshes automatically on every tick even if you don't press anything (enemies still move).

---

## HUD

```
Turn: 4  Player HP: 17/20  Status: active
  Arrow keys: move  |  WASD: attack  |  e: interact  |  q / ESC / Ctrl-C: quit

  → player moved to (5, 3)
  ⚔  enemy-1 attacked player for 3 dmg
```

| Field | Description |
|---|---|
| **Turn** | Number of ticks elapsed |
| **Player HP** | Current / max hit points |
| **Status** | `active` · `dead` · `extracted` |

Events below the stats show what happened on the last tick (up to 10 lines).

---

## Map Legend

| Char | Meaning |
|---|---|
| `#` | Wall |
| `.` | Empty floor |
| `P` | Player |
| `e` | Enemy |
| `E` | Exit |
| `$` | Item on floor |
| `H` | Hazard |
| `I` | Interactable (inactive) |
| `i` | Interactable (active) |

---

## Run End

When the run ends a banner is shown and the game loop stops:

- **YOU DIED** — player HP reached 0
- **EXTRACTED** — player stepped onto an exit tile

You are then prompted to delete the run or keep it in the session list.

---

## Session Run List

Runs persist in the session list until deleted or the server restarts. Select **List session runs** to see them:

```
  ID          Preset    Turn  Status
  ──────────────────────────────────────────────
  a1b2c3d4    default   12    active
  e5f6g7h8    maze      7     dead
```

Select a run from the list to re-open it.

> **Note:** runs are in-memory only on the server. If the server restarts, existing run IDs become invalid.

---

## Tick Speed

The server tick interval defaults to 1000 ms. Override with `TICK_MS`:

```bash
TICK_MS=500 pnpm nx serve dungeon-engine
```
