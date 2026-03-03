import { v4 as uuidv4 } from 'uuid';
import type { Grid, TileType, Entity, RunState, RunConfig } from './types.js';

const DEFAULT_CONFIG: RunConfig = {
  width: 20,
  height: 20,
  allowDiagonalCornerCutting: false,
  dashDistance: 2,
  chargerDashDistance: 2,
};

// Map legend: #=wall, .=floor, X=exit, P=player, 1/2/3=enemy starts, $=scrap
const PRESET_DEFAULT = [
  '####################',
  '#P................$#',
  '#..................#',
  '#....#####.........#',
  '#....#..1..#.......#',
  '#....#.....#.......#',
  '#....#####.........#',
  '#..................#',
  '#...2..............#',
  '#..................#',
  '#..................#',
  '#..................#',
  '#..................#',
  '#..................#',
  '#..................#',
  '#..................#',
  '#..................#',
  '#..................#',
  '#.........3.......X#',
  '####################',
];

const PRESET_OPEN = [
  '####################',
  '#..................#',
  '#.P................#',
  '#..................#',
  '#..................#',
  '#......1...........#',
  '#..................#',
  '#..................#',
  '#......2...........#',
  '#..................#',
  '#..................#',
  '#..................#',
  '#..................#',
  '#..................#',
  '#..................#',
  '#..................#',
  '#..................#',
  '#..................#',
  '#.................X#',
  '####################',
];

const PRESET_MAZE = [
  '####################',
  '#P.................#',
  '#.####.####.####...#',
  '#.#..#.#..#.#..#...#',
  '#.#.1#.#..#.#..#...#',
  '#.####.#..#.#..#####',
  '#......#..#.#......#',
  '#......####.#......#',
  '#.##########.#####.#',
  '#.#.....2..........#',
  '#.#.################',
  '#.#.#..............#',
  '#...#.####.#########',
  '#####.#..#.........#',
  '#.....#..#.#######.#',
  '#.#####..#.#.......#',
  '#........#.#.#####.#',
  '#.########.#.......#',
  '#..........#......X#',
  '####################',
];

function parseTileChar(ch: string): TileType {
  switch (ch) {
    case '#': return 'wall';
    case 'X': return 'exit';
    case 'H': return 'hazard';
    case 'I': return 'interactable';
    default:  return 'floor';
  }
}

interface ParseResult {
  grid: Grid;
  playerPos: { x: number; y: number };
  enemyPositions: Array<{ x: number; y: number; slot: number }>;
  scrapPositions: Array<{ x: number; y: number }>;
}

function parseMap(rows: string[]): ParseResult {
  const playerPos = { x: 1, y: 1 };
  const enemyPositions: Array<{ x: number; y: number; slot: number }> = [];
  const scrapPositions: Array<{ x: number; y: number }> = [];

  const grid: Grid = rows.map((row, y) =>
    row.split('').map((ch, x) => {
      if (ch === 'P') {
        playerPos.x = x;
        playerPos.y = y;
      } else if (ch === '$') {
        scrapPositions.push({ x, y });
      } else if (ch >= '1' && ch <= '9') {
        enemyPositions.push({ x, y, slot: parseInt(ch, 10) });
      }
      const tile: TileType = parseTileChar(ch);
      return { type: tile, items: [] };
    })
  );

  return { grid, playerPos, enemyPositions, scrapPositions };
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

function buildRunState(rows: string[], config: RunConfig): RunState {
  const { grid, playerPos, enemyPositions, scrapPositions } = parseMap(rows);

  // Add scrap items to their tiles
  for (const sp of scrapPositions) {
    grid[sp.y][sp.x].items.push({ id: uuidv4(), kind: 'scrap', qty: 1 });
  }

  const player = makePlayer(playerPos);
  const enemies = enemyPositions
    .map(ep => makeEnemy(ep.slot, { x: ep.x, y: ep.y }, config))
    .sort((a, b) => a.id.localeCompare(b.id));

  return {
    id: uuidv4(),
    grid,
    player,
    enemies,
    overclock: 0,
    events: [],
    status: 'active',
    config,
  };
}

export type PresetName = 'default' | 'open' | 'maze';

export function parsePreset(name: PresetName, configOverride?: Partial<RunConfig>): RunState {
  const config: RunConfig = { ...DEFAULT_CONFIG, ...configOverride };

  switch (name) {
    case 'open':  return buildRunState(PRESET_OPEN, config);
    case 'maze':  return buildRunState(PRESET_MAZE, config);
    default:      return buildRunState(PRESET_DEFAULT, config);
  }
}
