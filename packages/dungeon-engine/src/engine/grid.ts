import type { Direction, Entity, Grid, Pos, RunConfig, Tile } from '../models/types.js';

export const DIR_TO_DELTA: Record<Direction, { dx: number; dy: number }> = {
  N:  { dx:  0, dy: -1 },
  NE: { dx:  1, dy: -1 },
  E:  { dx:  1, dy:  0 },
  SE: { dx:  1, dy:  1 },
  S:  { dx:  0, dy:  1 },
  SW: { dx: -1, dy:  1 },
  W:  { dx: -1, dy:  0 },
  NW: { dx: -1, dy: -1 },
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
  return tile === null || tile.type === 'wall';
}

/** For a diagonal move (dx,dy), returns true if corner-cutting is blocked.
 *  Both orthogonal neighbors (from.x+dx, from.y) and (from.x, from.y+dy) must be non-wall. */
export function isDiagonalCornered(grid: Grid, from: Pos, dx: number, dy: number): boolean {
  return isWall(grid, from.x + dx, from.y) || isWall(grid, from.x, from.y + dy);
}

/** Returns all valid 8-dir non-wall neighbor positions from pos, respecting corner-cutting config. */
export function getNeighbors(grid: Grid, pos: Pos, config: Pick<RunConfig, 'allowDiagonalCornerCutting'>): Pos[] {
  const neighbors: Pos[] = [];

  for (const { dx, dy } of Object.values(DIR_TO_DELTA)) {
    const nx = pos.x + dx;
    const ny = pos.y + dy;

    if (!inBounds(grid, nx, ny)) continue;
    if (isWall(grid, nx, ny)) continue;

    const isDiagonal = dx !== 0 && dy !== 0;
    if (isDiagonal && !config.allowDiagonalCornerCutting) {
      if (isDiagonalCornered(grid, pos, dx, dy)) continue;
    }

    neighbors.push({ x: nx, y: ny });
  }

  return neighbors;
}

export function entityAt(entities: Entity[], x: number, y: number): Entity | undefined {
  return entities.find(e => e.pos.x === x && e.pos.y === y);
}
