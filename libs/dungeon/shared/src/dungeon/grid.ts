import type { Direction, Entity, Grid, Pos, Tile } from './types.js';

export const DIR_TO_DELTA: Record<Direction, { dx: number; dy: number }> = {
  N: { dx:  0, dy: -1 },
  E: { dx:  1, dy:  0 },
  S: { dx:  0, dy:  1 },
  W: { dx: -1, dy:  0 },
};

export function inBounds(grid: Grid, x: number, y: number): boolean {
  return y >= 0 && y < grid.length && x >= 0 && x < grid[y].length;
}

export function getTile(grid: Grid, x: number, y: number): Tile | null {
  if (!inBounds(grid, x, y)) return null;
  return grid[y][x];
}

export function isWall(grid: Grid, x: number, y: number): boolean {
  const tile = getTile(grid, x, y);
  return tile === null || tile.type === 'wall' || tile.type === 'weakWall';
}

const CARDINAL_DELTAS = [
  { dx:  0, dy: -1 }, // N
  { dx:  1, dy:  0 }, // E
  { dx:  0, dy:  1 }, // S
  { dx: -1, dy:  0 }, // W
];

/** Returns all valid cardinal (4-dir) non-wall neighbor positions from pos. */
export function getNeighbors(grid: Grid, pos: Pos): Pos[] {
  const neighbors: Pos[] = [];

  for (const { dx, dy } of CARDINAL_DELTAS) {
    const nx = pos.x + dx;
    const ny = pos.y + dy;

    if (!inBounds(grid, nx, ny)) continue;
    if (isWall(grid, nx, ny)) continue;

    neighbors.push({ x: nx, y: ny });
  }

  return neighbors;
}

export function entityAt(entities: Entity[], x: number, y: number): Entity | undefined {
  return entities.find(e => e.pos.x === x && e.pos.y === y);
}

const DIAGONAL_8_DELTAS = [
  { dx:  0, dy: -1 }, // N
  { dx:  1, dy: -1 }, // NE
  { dx:  1, dy:  0 }, // E
  { dx:  1, dy:  1 }, // SE
  { dx:  0, dy:  1 }, // S
  { dx: -1, dy:  1 }, // SW
  { dx: -1, dy:  0 }, // W
  { dx: -1, dy: -1 }, // NW
];

/** Returns all 8-directional neighbors within bounds (does NOT filter walls). */
export function neighbors8(grid: Grid, x: number, y: number): Pos[] {
  return DIAGONAL_8_DELTAS
    .map(({ dx, dy }) => ({ x: x + dx, y: y + dy }))
    .filter(p => inBounds(grid, p.x, p.y));
}
