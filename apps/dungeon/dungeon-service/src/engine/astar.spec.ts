import { describe, it, expect } from 'vitest';
import { astar } from './astar.js';
import type { Grid, Tile } from '@org/shared';

function makeGrid(rows: string[]): Grid {
  return rows.map(row =>
    row.split('').map(ch => ({
      type: ch === '#' ? 'wall' : 'floor',
      items: [],
      effects: [],
    } as Tile))
  );
}

describe('astar', () => {
  it('straight path on open floor returns shortest route', () => {
    const grid = makeGrid([
      '#####',
      '#...#',
      '#####',
    ]);
    const path = astar(grid, { x: 1, y: 1 }, { x: 3, y: 1 });
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
    const path = astar(grid, { x: 1, y: 1 }, { x: 3, y: 1 });
    expect(path).not.toBeNull();
    expect(path![0]).toEqual({ x: 1, y: 1 });
    expect(path![path!.length - 1]).toEqual({ x: 3, y: 1 });
    // Must not go through (2,1) which is a wall
    expect(path!.some(p => p.x === 2 && p.y === 1)).toBe(false);
  });

  it('path uses only cardinal steps (no diagonals)', () => {
    // Layout:
    //  #####
    //  #...#
    //  #...#
    //  #...#
    //  #####
    const grid = makeGrid([
      '#####',
      '#...#',
      '#...#',
      '#...#',
      '#####',
    ]);
    const path = astar(grid, { x: 1, y: 1 }, { x: 3, y: 3 });
    expect(path).not.toBeNull();
    // Every step must be exactly 1 tile in one axis only
    for (let i = 1; i < path!.length; i++) {
      const dx = Math.abs(path![i].x - path![i - 1].x);
      const dy = Math.abs(path![i].y - path![i - 1].y);
      expect(dx + dy).toBe(1);
    }
  });

  it('path length equals Manhattan distance + 1 on open floor', () => {
    // From (1,1) to (3,3): Manhattan distance = |3-1| + |3-1| = 4
    // So path should have 5 nodes (start + 4 steps)
    const grid = makeGrid([
      '#####',
      '#...#',
      '#...#',
      '#...#',
      '#####',
    ]);
    const path = astar(grid, { x: 1, y: 1 }, { x: 3, y: 3 });
    expect(path).not.toBeNull();
    expect(path!.length).toBe(5);
  });

  it('no path (fully walled off) returns null', () => {
    const grid = makeGrid([
      '#####',
      '#.###',
      '#####',
      '###.#',
      '#####',
    ]);
    const path = astar(grid, { x: 1, y: 1 }, { x: 3, y: 3 });
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
    const path1 = astar(grid, { x: 1, y: 1 }, { x: 6, y: 6 });
    const path2 = astar(grid, { x: 1, y: 1 }, { x: 6, y: 6 });
    expect(path1).toEqual(path2);
  });
});
