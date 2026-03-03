#!/usr/bin/env node
import { select, input } from '@inquirer/prompts';
import chalk from 'chalk';
import http from 'node:http';

// Override with DUNGEON_URL env var if the server runs on a different host/port
const BASE_URL = process.env.DUNGEON_URL ?? 'http://localhost:3001';
const { hostname, port, pathname: basePath } = new URL(BASE_URL);

// ─── HTTP helper ────────────────────────────────────────────────────────────

// Minimal HTTP client built on node:http — avoids any external fetch dependency.
// Always resolves (never rejects on non-2xx); rejects only on network errors.
function api(path, method = 'GET', body) {
  return new Promise((resolve, reject) => {
    const bodyStr = body !== undefined ? JSON.stringify(body) : undefined;
    const options = {
      hostname,
      port: port || 80,
      path: basePath.replace(/\/$/, '') + path,
      method,
      headers: {
        'Content-Type': 'application/json',
        // Content-Length required by node:http for POST/PUT bodies
        ...(bodyStr ? { 'Content-Length': Buffer.byteLength(bodyStr) } : {}),
      },
    };
    const req = http.request(options, (res) => {
      let raw = '';
      res.on('data', (chunk) => (raw += chunk));
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, data: raw ? JSON.parse(raw) : null });
        } catch {
          // Return raw string if the body isn't JSON (shouldn't happen with this API)
          resolve({ status: res.statusCode, data: raw });
        }
      });
    });
    req.on('error', reject);
    if (bodyStr) req.write(bodyStr);
    req.end();
  });
}

// Pings the server by requesting a non-existent run ID.
// A 404 response means the server is up and routing correctly.
// A network error (ECONNREFUSED etc.) means it's not running.
async function checkServer() {
  try {
    const { status } = await api('/runs/ping-check');
    return status === 404 || status === 200;
  } catch {
    return false;
  }
}

// ─── Grid renderer ──────────────────────────────────────────────────────────

// Map each ASCII glyph from the server's renderGrid() to a chalk color.
// Characters not in this map (spaces, newlines) pass through unstyled.
const CHAR_STYLES = {
  '#': (c) => chalk.dim(c),          // wall
  '.': (c) => chalk.gray(c),         // empty floor
  'P': (c) => chalk.bold.green(c),   // player
  'e': (c) => chalk.bold.red(c),     // enemy
  'E': (c) => chalk.bold.cyan(c),    // exit tile
  '$': (c) => chalk.yellow(c),       // item on floor
  'H': (c) => chalk.magenta(c),      // hazard
  'I': (c) => chalk.blue(c),         // interactable, inactive
  'i': (c) => chalk.bold.blue(c),    // interactable, active
};

// Applies chalk colors to every character in the raw ASCII render string.
function colorizeGrid(renderStr) {
  const lines = renderStr.split('\n');
  return lines
    .map((line) =>
      line
        .split('')
        .map((ch) => (CHAR_STYLES[ch] ? CHAR_STYLES[ch](ch) : ch))
        .join('')
    )
    .join('\n');
}

// ─── Event formatter ─────────────────────────────────────────────────────────

// Converts the raw turnEvents array from the API into human-readable lines.
// Caps at the last 10 events so the display stays compact on busy turns.
function formatEvents(turnEvents) {
  if (!turnEvents || turnEvents.length === 0) return '';
  const lines = [];
  for (const ev of turnEvents.slice(-10)) {
    switch (ev.type) {
      case 'move':
        if (ev.entityId === 'player') {
          lines.push(`  → player moved to (${ev.to.x}, ${ev.to.y})`);
        } else {
          lines.push(`  → ${ev.entityId} moved`);
        }
        break;
      case 'attack':
        lines.push(
          `  ⚔  ${ev.attackerId} attacked ${ev.targetId} for ${ev.damage} dmg`
        );
        break;
      case 'collision_attack':
        lines.push(
          `  💥 ${ev.attackerId} collided with ${ev.targetId} for ${ev.damage} dmg`
        );
        break;
      case 'death':
        lines.push(`  ☠  ${ev.entityId} was killed`);
        break;
      case 'pickup':
        lines.push(`  📦 picked up ${ev.item?.name ?? ev.item?.id ?? 'item'} ×1`);
        break;
      case 'noop':
        lines.push(`  ·  (no effect: ${ev.reason})`);
        break;
      case 'interacted':
        lines.push(`  🔧 ${ev.label} (${ev.kind}) → state ${ev.newState}`);
        break;
      case 'tile_changed':
        lines.push(`  🧱 tile (${ev.x},${ev.y}) changed: ${ev.from} → ${ev.to}`);
        break;
      case 'mechanism_solved':
        lines.push(`  ✅ mechanism triggered: ${ev.mechanismId}`);
        break;
      case 'mechanism_reset':
        lines.push(`  🔄 mechanism reset: ${ev.mechanismId}`);
        break;
      case 'run_end':
        // Handled separately as a banner
        break;
      default:
        break;
    }
  }
  return lines.join('\n');
}

function endBanner(reason) {
  if (reason === 'dead') {
    return chalk.bold.red('\n  ██╗   ██╗ ██████╗ ██╗   ██╗    ██████╗ ██╗███████╗██████╗ \n  ╚██╗ ██╔╝██╔═══██╗██║   ██║    ██╔══██╗██║██╔════╝██╔══██╗\n   ╚████╔╝ ██║   ██║██║   ██║    ██║  ██║██║█████╗  ██║  ██║\n    ╚██╔╝  ██║   ██║██║   ██║    ██║  ██║██║██╔══╝  ██║  ██║\n     ██║   ╚██████╔╝╚██████╔╝    ██████╔╝██║███████╗██████╔╝\n     ╚═╝    ╚═════╝  ╚═════╝     ╚═════╝ ╚═╝╚══════╝╚═════╝ \n');
  }
  return chalk.bold.cyan('\n  ███████╗██╗  ██╗████████╗██████╗  █████╗  ██████╗████████╗███████╗██████╗ ██╗\n  ██╔════╝╚██╗██╔╝╚══██╔══╝██╔══██╗██╔══██╗██╔════╝╚══██╔══╝██╔════╝██╔══██╗██║\n  █████╗   ╚███╔╝    ██║   ██████╔╝███████║██║        ██║   █████╗  ██║  ██║██║\n  ██╔══╝   ██╔██╗    ██║   ██╔══██╗██╔══██║██║        ██║   ██╔══╝  ██║  ██║╚═╝\n  ███████╗██╔╝ ██╗   ██║   ██║  ██║██║  ██║╚██████╗   ██║   ███████╗██████╔╝██╗\n  ╚══════╝╚═╝  ╚═╝   ╚═╝   ╚═╝  ╚═╝╚═╝  ╚═╝ ╚═════╝   ╚═╝   ╚══════╝╚═════╝ ╚═╝\n');
}

// ─── Session state ───────────────────────────────────────────────────────────

// Tracks runs created or visited in this CLI session so the List view works.
// The API has no GET /runs endpoint, so we maintain this client-side.
// Shape: Map<runId, { id, preset, status, overclock }>
const sessionRuns = new Map();

// ─── Arcade mode (WebSocket real-time game loop) ─────────────────────────────

// Key → PlayerAction mapping for raw-mode arrow key input.
// Arrow keys arrive as 3-byte escape sequences.
const KEY_TO_ACTION = {
  '\u001b[A': { type: 'move',   dir: 'N' },  // ↑
  '\u001b[B': { type: 'move',   dir: 'S' },  // ↓
  '\u001b[C': { type: 'move',   dir: 'E' },  // →
  '\u001b[D': { type: 'move',   dir: 'W' },  // ←
  'w':        { type: 'attack', dir: 'N' },  // W
  's':        { type: 'attack', dir: 'S' },  // S
  'd':        { type: 'attack', dir: 'E' },  // D
  'a':        { type: 'attack', dir: 'W' },  // A
  'e':        { type: 'interact' },           // E
};

function renderFrame(state, render, turnEvents, error) {
  console.clear();
  // Grid (strip trailing stat line — we print our own)
  console.log(colorizeGrid(render.split('\n').slice(0, -2).join('\n')));
  console.log();

  const { player, overclock, status } = state;
  const statusStr = status === 'active'
    ? chalk.green(status)
    : status === 'dead' ? chalk.red(status) : chalk.cyan(status);
  console.log(
    `Turn: ${chalk.bold(overclock)}  ` +
    `Player HP: ${chalk.bold(player.hp)}/${player.maxHp}  ` +
    `Status: ${statusStr}`
  );
  console.log(chalk.gray('  Arrow keys: move  |  WASD: attack  |  e: interact  |  q / ESC / Ctrl-C: quit'));

  if (turnEvents && turnEvents.length > 0) {
    console.log();
    const evText = formatEvents(turnEvents);
    if (evText) console.log(evText);
  }

  if (error) {
    console.log(chalk.yellow(`  ! ${error}`));
  }
}

async function arcadeMode(runId, initialData) {
  const wsUrl = BASE_URL.replace(/^http/, 'ws') + `/runs/${runId}/ws`;

  return new Promise((resolve) => {
    let ws;
    let latestState = initialData?.state ?? null;
    let ended = false;

    function cleanup() {
      if (process.stdin.isTTY && process.stdin.setRawMode) {
        try { process.stdin.setRawMode(false); } catch { /* ignore */ }
      }
      process.stdin.pause();
      try { ws?.close(); } catch { /* ignore */ }
    }

    function handleEnd(status) {
      if (ended) return;
      ended = true;
      cleanup();

      console.log();
      console.log(endBanner(status));

      // Use async IIFE so we can await the select prompt
      (async () => {
        const choice = await select({
          message: 'Run is over.',
          choices: [
            { name: 'Delete run & return to main menu', value: 'delete' },
            { name: 'Keep & return to main menu',       value: 'back' },
          ],
        });
        if (choice === 'delete') {
          await api(`/runs/${runId}`, 'DELETE');
          sessionRuns.delete(runId);
        }
        resolve();
      })();
    }

    try {
      ws = new WebSocket(wsUrl);
    } catch (err) {
      console.log(chalk.red(`Failed to connect WebSocket: ${err.message}`));
      resolve();
      return;
    }

    ws.addEventListener('open', () => {
      // Enable raw mode for single-keypress capture
      if (process.stdin.isTTY && process.stdin.setRawMode) {
        process.stdin.setRawMode(true);
      }
      process.stdin.resume();
      process.stdin.setEncoding('utf8');

      process.stdin.on('data', (key) => {
        if (ended) return;

        // q, ESC, or Ctrl-C → quit
        if (key === 'q' || key === '\u001b' || key === '\u0003') {
          ended = true;
          cleanup();
          resolve();
          return;
        }

        const action = KEY_TO_ACTION[key];
        if (action && ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify(action));
        }
      });
    });

    ws.addEventListener('message', (event) => {
      if (ended) return;
      try {
        const data = JSON.parse(event.data);
        if (data.error && !data.state) {
          // Server-level error (e.g. run not found)
          console.log(chalk.red(`Server error: ${data.error}`));
          cleanup();
          resolve();
          return;
        }
        const { state, render, turnEvents, error } = data;
        latestState = state;

        // Update session record
        sessionRuns.set(runId, {
          id: runId,
          preset: sessionRuns.get(runId)?.preset ?? 'unknown',
          status: state.status,
          overclock: state.overclock,
        });

        renderFrame(state, render, turnEvents, error);

        if (state.status !== 'active') {
          handleEnd(state.status);
        }
      } catch {
        // ignore malformed frames
      }
    });

    ws.addEventListener('close', () => {
      if (!ended) {
        ended = true;
        cleanup();
        resolve();
      }
    });

    ws.addEventListener('error', (err) => {
      if (!ended) {
        console.log(chalk.red(`WebSocket error: ${err.message ?? 'unknown'}`));
        cleanup();
        resolve();
      }
    });
  });
}

// ─── List session runs ───────────────────────────────────────────────────────

async function listRunsMenu() {
  if (sessionRuns.size === 0) {
    console.log(chalk.gray('\n  No runs in this session yet.\n'));
    await select({ message: '', choices: [{ name: 'Back', value: 'back' }] });
    return;
  }

  // Active runs first, then ended runs (dead/extracted)
  const active = [...sessionRuns.values()].filter((r) => r.status === 'active');
  const ended  = [...sessionRuns.values()].filter((r) => r.status !== 'active');

  console.log();
  console.log(
    chalk.bold('  ID          ') +
    chalk.bold('Preset    ') +
    chalk.bold('Turn  ') +
    chalk.bold('Status')
  );
  console.log('  ' + '─'.repeat(46));

  for (const run of [...active, ...ended]) {
    const shortId = run.id.slice(0, 8);
    const statusStr = run.status === 'active'
      ? chalk.green(run.status)
      : run.status === 'dead'
        ? chalk.red(run.status)
        : chalk.cyan(run.status);
    console.log(
      `  ${shortId}    ${run.preset.padEnd(10)}${String(run.overclock).padEnd(6)}${statusStr}`
    );
  }
  console.log();

  const backChoice = { name: 'Back', value: '__back__' };
  const runChoices = [...active, ...ended].map((r) => ({
    name: `${r.id.slice(0, 8)}  ${r.preset}  turn ${r.overclock}  ${r.status}`,
    value: r.id,
  }));

  const choice = await select({
    message: 'Select a run to open, or go back:',
    choices: [...runChoices, backChoice],
  });

  if (choice === '__back__') return;

  // Re-open run view (fetch current state)
  const resp = await api(`/runs/${choice}`);
  if (resp.status === 404) {
    console.log(chalk.red('\nRun no longer exists on server (was it restarted?).'));
    sessionRuns.delete(choice);
    return;
  }
  await arcadeMode(choice, resp.data);
}

// ─── New run flow ─────────────────────────────────────────────────────────────

const PRESET_CHOICES = [
  {
    name: 'default  (20×20, room + 3 enemies: chaser / patrol / charger)',
    value: 'default',
  },
  {
    name: 'open     (20×20, sparse walls, 2 chasers)',
    value: 'open',
  },
  {
    name: 'maze     (20×20, dense corridors, 2 enemies)',
    value: 'maze',
  },
];

async function newRunFlow() {
  const preset = await select({ message: 'Choose a preset:', choices: PRESET_CHOICES });
  const resp = await api('/runs', 'POST', { preset });

  if (resp.status !== 201) {
    console.log(chalk.red(`\nFailed to create run: ${JSON.stringify(resp.data)}\n`));
    return;
  }

  const { runId, state, render, turnEvents } = resp.data;
  sessionRuns.set(runId, {
    id: runId,
    preset,
    status: state.status,
    overclock: state.overclock,
  });

  await arcadeMode(runId, { state, render, turnEvents: turnEvents ?? [] });
}

// ─── Main menu ────────────────────────────────────────────────────────────────

async function mainMenu() {
  while (true) {
    const active = [...sessionRuns.values()].filter((r) => r.status === 'active').length;
    const ended  = sessionRuns.size - active;

    const listLabel =
      sessionRuns.size === 0
        ? 'List session runs  (none yet)'
        : `List session runs  (${active} active, ${ended} ended)`;

    const choice = await select({
      message: 'What would you like to do?',
      choices: [
        { name: 'New run',   value: 'new' },
        { name: listLabel,   value: 'list' },
        { name: 'Quit',      value: 'quit' },
      ],
    });

    if (choice === 'quit') {
      console.log(chalk.gray('\nBye!\n'));
      process.exit(0);
    }

    if (choice === 'new') {
      await newRunFlow();
    } else {
      await listRunsMenu();
    }
  }
}

// ─── Entry point ──────────────────────────────────────────────────────────────

console.clear();
console.log(chalk.bold.cyan('  Dungeon Engine CLI'));
console.log(chalk.gray(`  Connecting to ${BASE_URL} …\n`));

const alive = await checkServer();
if (!alive) {
  console.error(
    chalk.red(`Server not running at ${BASE_URL}.\n`) +
    chalk.yellow('Run: pnpm nx serve dungeon-engine')
  );
  process.exit(1);
}

console.log(chalk.green('  Server reachable. Starting CLI…\n'));
await mainMenu();
