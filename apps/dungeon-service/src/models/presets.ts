import { v4 as uuidv4 } from 'uuid';
import { resolve } from 'node:path';
import type { Grid, TileType, Entity, RunState, RunConfig, InteractableDef, MechanismDef, PlayerProfile, StartReceipt } from '@org/shared';
import { applyEffect } from '../engine/effects.js';
import { loadTmxFile } from '../engine/tmx-loader.js';

// Resolve TMX path: game/public/tiles is a sibling app
// At runtime __dirname = apps/dungeon-service/dist/ (CJS bundle output)
// 3 levels up: dist/ → dungeon-service/ → apps/ → repo root, then into apps/game
export function resolveTmxPath(filename: string): string {
  return resolve(__dirname, '../../../game/public/tiles', filename);
}

const DEFAULT_CONFIG: RunConfig = {
  width: 20,
  height: 20,
  allowDiagonalCornerCutting: false,
  dashDistance: 2,
  chargerDashDistance: 2,
};

// Map legend: #=wall, .=floor, X=exit, P=player, 1/2/3=enemy starts, $=scrap
const PRESET_DEFAULT = [
  '....................',
  '.P................$.',
  '....................',
  '.....#####..........',
  '.....#..1..#........',
  '.....#.....#........',
  '.....#####..........',
  '.....I..............',
  '....2...............',
  '....................',
  '....................',
  '....................',
  '....................',
  '....................',
  '....................',
  '....................',
  '....................',
  '....................',
  '..........3.......X.',
  '....................',
];

const PRESET_OPEN = [
  '....................',
  '....................',
  '..P.................',
  '....................',
  '....................',
  '.......1............',
  '....................',
  '....................',
  '.......2............',
  '....................',
  '....................',
  '....................',
  '....................',
  '....................',
  '....................',
  '....................',
  '....................',
  '....................',
  '..................X.',
  '....................',
];

const PRESET_MAZE = [
  '....................',
  '.P..................',
  '..####.####.####....',
  '..#..#.#..#.#..#....',
  '..#.1#.#..#.#..#....',
  '..####.#..#.#..####.',
  '.......#..#.#.......',
  '.......####.#.......',
  '..##########.#####..',
  '..#.....2...........',
  '..#.###############.',
  '..#.#...............',
  '....#.####.########.',
  '.####.#..#..........',
  '......#..#.#######..',
  '..#####..#.#........',
  '.........#.#.#####..',
  '..########.#........',
  '...........#......X.',
  '....................',
];

const PRESET_OIL_TRAP = [
  '##########',
  '#P.......#',
  '#........#',
  '#..OOOO..#',
  '#..OOOO..#',
  '#..OOOO..#',
  '#..OOOO.1#',
  '#......W##',
  '#.....#X.#',
  '##########',
];

const PRESET_TERMINAL_DOOR = [
  '##########',
  '#2.......#',
  '#..#.....#',
  '#..#.....#',
  '#..#.....#',
  '#..#.....#',
  '#..#.....#',
  '#..#T....#',
  '#X.D....P#',
  '##########',
];

const PRESET_FIRE_STRESS = [
  '####################',
  '#P.................#',
  '#..................#',
  '#..................#',
  '#..OOOOOOOOOO......#',
  '#..OOOOOOOOOO......#',
  '#..O........O......#',
  '#..O........O..OO..#',
  '#..O........O..OO..#',
  '#..O........O......#',
  '#..O........O......#',
  '#..OOOOOOOOOO......#',
  '#..................#',
  '#..................#',
  '#..................#',
  '#..................#',
  '#..................#',
  '#..................#',
  '#.................X#',
  '####################',
];

const PRESET_MINE_CHAIN = [
  '####################',
  '#P.....W.W.W......X#',
  '####################',
  '#............1.....#',
  '#..................#',
  '#..................#',
  '#..................#',
  '#..................#',
  '#..................#',
  '#..................#',
  '#..................#',
  '#..................#',
  '#..................#',
  '#..................#',
  '#..................#',
  '#..................#',
  '#..................#',
  '#..................#',
  '#..................#',
  '####################',
];

// 5×5 room: player surrounded by 8 enemies → instant death
const PRESET_KILL_ROOM = [
  '#####',
  '#111#',
  '#1P1#',
  '#111#',
  '#####',
];

// 2×1 room: player adjacent to exit → one move extracts
const PRESET_EXIT_ROOM = [
  'PX',
];

const PRESET_AI_MAZE = [
  '####################',
  '#P................3#',
  '#.################.#',
  '#.################.#',
  '#.################.#',
  '#.################.#',
  '#.################.#',
  '#.################.#',
  '#.################.#',
  '#.################.#',
  '#.################.#',
  '#.################.#',
  '#.################.#',
  '#.################.#',
  '#.################.#',
  '#.################.#',
  '#.################.#',
  '#.################.#',
  '#.................1#',
  '####################',
];

const TERMINAL_DOOR_INTERACTABLES: Record<string, InteractableDef> = {
  '4,7': { id: 'terminal-1', kind: 'terminal', label: 'Dead Terminal', state: 0, stateCount: 2 },
};

const TERMINAL_DOOR_MECHANISMS: MechanismDef[] = [{
  id:           'mechanism-terminal-door',
  conditions:   [{ interactableId: 'terminal-1', state: 1 }],
  effects:      [{ type: 'tile_change', x: 3, y: 8, to: 'floor' }],
  resetEffects: [{ type: 'tile_change', x: 3, y: 8, to: 'wall'  }],
  satisfied: false,
}];

const DEFAULT_INTERACTABLES: Record<string, InteractableDef> = {
  '5,7': { id: 'lever-a', kind: 'lever', label: 'Lever A', state: 0, stateCount: 2 },
};

const DEFAULT_MECHANISMS: MechanismDef[] = [
  {
    id:           'mechanism-lever-door',
    conditions:   [{ interactableId: 'lever-a', state: 1 }],
    effects:      [{ type: 'tile_change', x: 5, y: 6, to: 'floor' }],
    resetEffects: [{ type: 'tile_change', x: 5, y: 6, to: 'wall'  }],
    satisfied: false,
  },
];

function parseTileChar(ch: string): TileType {
  switch (ch) {
    case '#': return 'wall';
    case 'W': return 'weakWall';
    case 'X': return 'exit';
    case 'H': return 'hazard';
    case 'I': return 'interactable';
    case 'T': return 'interactable';
    case 'D': return 'wall';
    default:  return 'floor';
  }
}

interface ParseResult {
  grid: Grid;
  playerPos: { x: number; y: number };
  enemyPositions: Array<{ x: number; y: number; slot: number }>;
  scrapPositions: Array<{ x: number; y: number }>;
  oilPositions: Array<{ x: number; y: number }>;
}

function parseMap(rows: string[]): ParseResult {
  const playerPos = { x: 1, y: 1 };
  const enemyPositions: Array<{ x: number; y: number; slot: number }> = [];
  const scrapPositions: Array<{ x: number; y: number }> = [];
  const oilPositions: Array<{ x: number; y: number }> = [];

  const grid: Grid = rows.map((row, y) =>
    row.split('').map((ch, x) => {
      if (ch === 'P') {
        playerPos.x = x;
        playerPos.y = y;
      } else if (ch === '$') {
        scrapPositions.push({ x, y });
      } else if (ch === 'O') {
        oilPositions.push({ x, y });
      } else if (ch >= '1' && ch <= '9') {
        enemyPositions.push({ x, y, slot: parseInt(ch, 10) });
      }
      const tile: TileType = parseTileChar(ch);
      return { type: tile, items: [], effects: [] };
    })
  );

  return { grid, playerPos, enemyPositions, scrapPositions, oilPositions };
}

function makePlayer(pos: { x: number; y: number }): Entity {
  return {
    id: 'player',
    kind: 'player',
    pos,
    hp: 20,
    maxHp: 20,
    attackDamage: 5,
    state: {},
  };
}

function makeEnemy(slot: number, pos: { x: number; y: number }, config: RunConfig): Entity {
  // Slot 1 = chase_astar, 2 = patrol_loop, 3 = charger
  const aiTypes: Record<number, Entity['aiType']> = {
    1: 'chase_astar',
    2: 'patrol_loop',
    3: 'charger',
  };
  const aiType = aiTypes[slot] ?? 'chase_astar';

  const state: Record<string, unknown> = {};

  // Patrol loop gets hardcoded waypoints near its spawn
  if (aiType === 'patrol_loop') {
    state['path'] = [
      { x: pos.x, y: pos.y },
      { x: pos.x + 4, y: pos.y },
      { x: pos.x + 4, y: pos.y + 4 },
      { x: pos.x, y: pos.y + 4 },
    ].map(p => ({
      x: Math.max(1, Math.min(config.width - 2, p.x)),
      y: Math.max(1, Math.min(config.height - 2, p.y)),
    }));
    state['index'] = 0;
  }

  return {
    id: `enemy-${slot}`,
    kind: 'enemy',
    pos,
    hp: 10,
    maxHp: 10,
    attackDamage: 3,
    aiType,
    state,
  };
}

function buildRunState(
  rows: string[],
  config: RunConfig,
  interactableDefs: Record<string, InteractableDef> = {},
  mechanisms: MechanismDef[] = [],
  profile?: PlayerProfile,
  preset?: string,
  metaMode?: 'bypass' | 'strict',
  playerId?: string,
  escrowId?: string,
): RunState {
  const { grid, playerPos, enemyPositions, scrapPositions, oilPositions } = parseMap(rows);

  // Add scrap items to their tiles
  for (const sp of scrapPositions) {
    grid[sp.y][sp.x].items.push({ id: uuidv4(), kind: 'scrap', qty: 1 });
  }

  // Apply oil effects to oil tiles
  for (const op of oilPositions) {
    applyEffect(grid[op.y][op.x], { tag: 'oil' });
  }

  // Embed interactable metadata into matching tiles
  for (const [key, def] of Object.entries(interactableDefs)) {
    const [x, y] = key.split(',').map(Number);
    const tile = grid[y]?.[x];
    if (tile?.type === 'interactable') tile.interactable = { ...def };
  }

  const player = makePlayer(playerPos);
  const rawEnemies = enemyPositions.map(ep => makeEnemy(ep.slot, { x: ep.x, y: ep.y }, config));
  // Deduplicate IDs when multiple enemies share the same slot
  const idCounts: Record<string, number> = {};
  for (const e of rawEnemies) idCounts[e.id] = (idCounts[e.id] ?? 0) + 1;
  const idCounters: Record<string, number> = {};
  const enemies = rawEnemies
    .map(e => {
      if (idCounts[e.id] > 1) {
        idCounters[e.id] = (idCounters[e.id] ?? 0) + 1;
        return { ...e, id: `${e.id}-${idCounters[e.id]}` };
      }
      return e;
    })
    .sort((a, b) => a.id.localeCompare(b.id));

  const id = uuidv4();
  const resolvedProfile = profile ?? { inventory: {}, loadout: { slotA: null, slotB: null, activeSlot: 'A' as const } };

  const startReceipt: StartReceipt = {
    runId: id,
    preset: preset ?? 'default',
    createdAt: Date.now(),
    packed: {
      instances: [],
      stacks: Object.fromEntries(
        Object.entries(resolvedProfile.inventory).map(([k, v]) => [k, { qty: v }])
      ),
    },
    capacity: { maxSlots: 2, rules: { ammoMaxStack: 99, ammoOccupiesSlots: 0 } },
    metaMode: metaMode ?? 'bypass',
    ...(playerId ? { playerId } : {}),
    ...(escrowId ? { escrowId } : {}),
  };

  return {
    id,
    currentRoomId: preset ?? 'default',
    rooms: {},
    grid,
    player,
    enemies,
    overclock: 0,
    events: [],
    status: 'active',
    config,
    mechanisms: mechanisms.map(m => ({ ...m })),
    pendingExplosions: [],
    runItemState: { A: {}, B: {} },
    profile: resolvedProfile,
    startReceipt,
  };
}

export type PresetName = 'default' | 'open' | 'maze' | 'oil_trap' | 'terminal_door' | 'fire_stress' | 'mine_chain' | 'ai_maze_regression' | 'kill_room' | 'exit_room';

export function parsePreset(
  name: PresetName,
  configOverride?: Partial<RunConfig>,
  profile?: PlayerProfile,
  metaMode?: 'bypass' | 'strict',
  playerId?: string,
  escrowId?: string,
): RunState {
  const config: RunConfig = { ...DEFAULT_CONFIG, ...configOverride };

  switch (name) {
    case 'open': {
      // Load TMX object layers for this preset
      const tmx = loadTmxFile(resolveTmxPath('open-preset.tmx'));

      // Build base state from string grid (walls/floors layout unchanged)
      const state = buildRunState(PRESET_OPEN, config, {}, [], profile, name, metaMode, playerId, escrowId);

      // Override enemies from TMX (replace hardcoded enemy list)
      state.enemies = tmx.enemies.map((e, i) => ({
        id: `enemy-${i + 1}`,
        kind: 'enemy' as const,
        pos: e.pos,
        hp: e.hp,
        maxHp: e.maxHp,
        attackDamage: e.attackDamage,
        aiType: e.aiType,
        state: e.patrolWaypoints ? { path: e.patrolWaypoints, index: 0 } : {},
      }));

      // Player spawn from TMX (replace hardcoded start position)
      const defaultSpawn = tmx.spawns.find(s => s.name === 'default');
      const playerPos = defaultSpawn?.pos ?? { x: 2, y: 2 };
      state.player = { ...state.player, pos: playerPos };

      // Place extract tile from TMX
      if (tmx.extract) {
        state.grid[tmx.extract.y][tmx.extract.x].type = 'exit';
      }

      // Wire nameIndex into config for mechanism targetName resolution
      state.config = { ...state.config, nameIndex: tmx.nameIndex };

      return state;
    }
    case 'maze':  return buildRunState(PRESET_MAZE, config, {}, [], profile, name, metaMode, playerId, escrowId);
    case 'oil_trap': {
      const defaultProfile: PlayerProfile = {
        inventory: {},
        loadout: { slotA: 'remote_mine', slotB: 'hammer', activeSlot: 'A' },
      };
      return buildRunState(PRESET_OIL_TRAP, config, {}, [], profile ?? defaultProfile, name, metaMode, playerId, escrowId);
    }
    case 'terminal_door': {
      const defaultProfile: PlayerProfile = {
        inventory: {},
        loadout: { slotA: 'shock_baton', slotB: null, activeSlot: 'A' },
      };
      return buildRunState(
        PRESET_TERMINAL_DOOR,
        { ...DEFAULT_CONFIG, width: 10, height: 10 },
        TERMINAL_DOOR_INTERACTABLES,
        TERMINAL_DOOR_MECHANISMS,
        profile ?? defaultProfile,
        name,
        metaMode,
        playerId,
        escrowId,
      );
    }
    case 'fire_stress':        return buildRunState(PRESET_FIRE_STRESS, config, {}, [], profile, name, metaMode, playerId, escrowId);
    case 'mine_chain':         return buildRunState(PRESET_MINE_CHAIN, config, {}, [], profile, name, metaMode, playerId, escrowId);
    case 'ai_maze_regression': return buildRunState(PRESET_AI_MAZE, config, {}, [], profile, name, metaMode, playerId, escrowId);
    case 'kill_room':          return buildRunState(PRESET_KILL_ROOM, { ...DEFAULT_CONFIG, width: 5, height: 5 }, {}, [], profile, name, metaMode, playerId, escrowId);
    case 'exit_room':          return buildRunState(PRESET_EXIT_ROOM, { ...DEFAULT_CONFIG, width: 2, height: 1 }, {}, [], profile, name, metaMode, playerId, escrowId);
    default:       return buildRunState(PRESET_DEFAULT, config, DEFAULT_INTERACTABLES, DEFAULT_MECHANISMS, profile, name, metaMode, playerId, escrowId);
  }
}
