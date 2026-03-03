import { describe, it, expect } from 'vitest';
import { astar } from './astar.js';
import type { Grid, Tile } from '../models/types.js';

function makeGrid(rows: string[]): Grid {
  return rows.map(row =>
    row.split('').map(ch => ({
      type: ch === '#' ? 'wall' : 'floor',
      items: [],
    } as Tile))
  );
}

const NO_CORNER_CUT = { allowDiagonalCornerCutting: false };
const CORNER_CUT    = { allowDiagonalCornerCutting: true };

describe('astar', () => {
  it('straight path on open floor returns shortest route', () => {
    const grid = makeGrid([
      '#####',
      '#...#',
      '#####',
    ]);
    const path = astar(grid, { x: 1, y: 1 }, { x: 3, y: 1 }, NO_CORNER_CUT);
    expect(path).not.toBeNull();
    expect(path![0]).toEqual({ x: 1, y: 1 });
    expect(path![path!.length - 1]).toEqual({ x: 3, y: 1 });
    expect(path!.length).toBe(3);  // [1,1], [2,1], [3,1]
  });

  it('finds path around a wall obstacle', () => {
    // Layout:
    //  #####
    //  #.#.#
    //  #...#
    //  #####
    const grid = makeGrid([
      '#####',
      '#.#.#',
      '#...#',
      '#####',
    ]);
    const path = astar(grid, { x: 1, y: 1 }, { x: 3, y: 1 }, NO_CORNER_CUT);
    expect(path).not.toBeNull();
    expect(path![0]).toEqual({ x: 1, y: 1 });
    expect(path![path!.length - 1]).toEqual({ x: 3, y: 1 });
    // Must not go through (2,1) which is a wall
    expect(path!.some(p => p.x === 2 && p.y === 1)).toBe(false);
  });

  it('corner-cutting disabled: diagonal adjacent to wall corner is blocked', () => {
    // Layout:
    //  ####
    //  #..#
    //  ##.#
    //  ####
    // Moving diagonally from (1,1) to (2,2) requires passing through the corner
    // The path from (1,1) SE corner is blocked because (2,1) is open but (1,2) is wall
    const grid = makeGrid([
      '####',
      '#..#',
      '##.#',
      '####',
    ]);
    // (1,1) -> diagonal SE -> (2,2): dx=1, dy=1
    // Check: isWall(1+1,1) = isWall(2,1) = false (open)
    //        isWall(1,1+1) = isWall(1,2) = true (wall)
    // So diagonal is cornered and blocked without corner-cutting
    const pathNoCut = astar(grid, { x: 1, y: 1 }, { x: 2, y: 2 }, NO_CORNER_CUT);
    // The direct diagonal is blocked; path should go right then down or be longer
    if (pathNoCut !== null) {
      // Should not include the direct diagonal step in a single move
      let prevPos = pathNoCut[0];
      for (let i = 1; i < pathNoCut.length; i++) {
        const curr = pathNoCut[i];
        const dx = curr.x - prevPos.x;
        const dy = curr.y - prevPos.y;
        if (dx !== 0 && dy !== 0) {
          // diagonal step — must not be cornered
          const cornerBlocked =
            grid[prevPos.y][prevPos.x + dx]?.type === 'wall' ||
            grid[prevPos.y + dy][prevPos.x]?.type === 'wall';
          expect(cornerBlocked).toBe(false);
        }
        prevPos = curr;
      }
    }
  });

  it('corner-cutting enabled: same diagonal is allowed', () => {
    const grid = makeGrid([
      '####',
      '#..#',
      '##.#',
      '####',
    ]);
    // With corner cutting enabled, the diagonal from (1,1) to (2,2) should be usable
    const pathCut = astar(grid, { x: 1, y: 1 }, { x: 2, y: 2 }, CORNER_CUT);
    expect(pathCut).not.toBeNull();
    // Path should be direct: [(1,1),(2,2)] — length 2
    expect(pathCut!.length).toBe(2);
    expect(pathCut![0]).toEqual({ x: 1, y: 1 });
    expect(pathCut![1]).toEqual({ x: 2, y: 2 });
  });

  it('no path (fully walled off) returns null', () => {
    const grid = makeGrid([
      '#####',
      '#.###',
      '#####',
      '###.#',
      '#####',
    ]);
    const path = astar(grid, { x: 1, y: 1 }, { x: 3, y: 3 }, NO_CORNER_CUT);
    expect(path).toBeNull();
  });

  it('deterministic: same inputs always produce same path', () => {
    const grid = makeGrid([
      '########',
      '#......#',
      '#.####.#',
      '#.#..#.#',
      '#.#..#.#',
      '#.####.#',
      '#......#',
      '########',
    ]);
    const path1 = astar(grid, { x: 1, y: 1 }, { x: 6, y: 6 }, NO_CORNER_CUT);
    const path2 = astar(grid, { x: 1, y: 1 }, { x: 6, y: 6 }, NO_CORNER_CUT);
    expect(path1).toEqual(path2);
  });
});
