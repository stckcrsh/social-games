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
  'X': (c) => chalk.blue(c),         // interactable
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

// ─── Direction picker ────────────────────────────────────────────────────────

const DIR_CHOICES = [
  { name: '↑  N',  value: 'N' },
  { name: '↗  NE', value: 'NE' },
  { name: '→  E',  value: 'E' },
  { name: '↘  SE', value: 'SE' },
  { name: '↓  S',  value: 'S' },
  { name: '↙  SW', value: 'SW' },
  { name: '←  W',  value: 'W' },
  { name: '↖  NW', value: 'NW' },
];

async function pickDirection() {
  return select({ message: 'Direction:', choices: DIR_CHOICES });
}

// ─── Run view ────────────────────────────────────────────────────────────────

// Main game loop for an individual run.
// `initialData` is the response body from POST /runs or POST /runs/:id/action —
// reused directly so we don't make an extra GET on the first render.
// Each iteration: render → prompt → submit action → re-render with response.
async function runView(runId, initialData) {
  let data = initialData;

  while (true) {
    console.clear();

    // If we entered via List view we only have { state } — fetch the full render
    if (!data || !data.render) {
      const resp = await api(`/runs/${runId}`);
      if (resp.status === 404) {
        console.log(chalk.red('Run not found (was the server restarted?).'));
        sessionRuns.delete(runId);
        return;
      }
      data = resp.data;
    }

    const { state, render, turnEvents, error } = data;

    // Strip the trailing stat line from the render string — we reprint it
    // ourselves below with chalk formatting, so only show the raw grid rows.
    console.log(colorizeGrid(render.split('\n').slice(0, -2).join('\n')));
    console.log();

    // Stats line
    const { player, overclock, status } = state;
    console.log(
      `Turn: ${chalk.bold(overclock)}  ` +
      `Player HP: ${chalk.bold(player.hp)}/${player.maxHp}  ` +
      `Status: ${status === 'active' ? chalk.green(status) : status === 'dead' ? chalk.red(status) : chalk.cyan(status)}`
    );

    // Turn events
    if (turnEvents && turnEvents.length > 0) {
      console.log();
      const evText = formatEvents(turnEvents);
      if (evText) console.log(evText);

      // Check for run_end event
      const endEv = turnEvents.find((e) => e.type === 'run_end');
      if (endEv) console.log(endBanner(endEv.reason));
    }

    // Show error if any
    if (error) {
      console.log(chalk.yellow(`  ! ${error}`));
    }

    // Update session record
    sessionRuns.set(runId, {
      id: runId,
      preset: sessionRuns.get(runId)?.preset ?? 'unknown',
      status,
      overclock,
    });

    // Once status is no longer 'active' the server won't advance the run further.
    // Show the end banner (if it wasn't already shown via a run_end event above),
    // then prompt the user to clean up or return.
    if (status !== 'active') {
      console.log();
      if (!turnEvents || !turnEvents.find((e) => e.type === 'run_end')) {
        // Entering from List view: run was already ended, no turnEvents — show banner now
        console.log(endBanner(status));
      }
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
      return;
    }

    // Action prompt
    const action = await select({
      message: 'Action:',
      choices: [
        { name: 'Move',              value: 'move' },
        { name: 'Attack',            value: 'attack' },
        { name: 'Dash',              value: 'dash' },
        { name: 'Interact  (stub)',  value: 'interact' },
        { name: 'Back to main menu', value: 'back' },
      ],
    });

    if (action === 'back') return;

    if (action === 'interact') {
      const resp = await api(`/runs/${runId}/action`, 'POST', { type: 'interact' });
      data = resp.data;
      continue;
    }

    // Needs direction
    const dir = await pickDirection();
    const resp = await api(`/runs/${runId}/action`, 'POST', { type: action, dir });
    data = resp.data;
  }
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
  await runView(choice, resp.data);
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

  await runView(runId, { state, render, turnEvents: turnEvents ?? [] });
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
