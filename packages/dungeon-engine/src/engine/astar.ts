import type { Grid, Pos, RunConfig } from '../models/types.js';
import { getNeighbors } from './grid.js';

function chebyshev(a: Pos, b: Pos): number {
  return Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
}

function posKey(p: Pos): string {
  return `${p.x},${p.y}`;
}

interface Node {
  pos: Pos;
  g: number;
  h: number;
  f: number;
  parent: Node | null;
}

export function astar(
  grid: Grid,
  from: Pos,
  to: Pos,
  config: Pick<RunConfig, 'allowDiagonalCornerCutting'>
): Pos[] | null {
  const startH = chebyshev(from, to);
  const startNode: Node = { pos: from, g: 0, h: startH, f: startH, parent: null };

  // Open set as sorted array: sorted by f asc, then h asc, then y asc, then x asc
  const open: Node[] = [startNode];
  const gScores = new Map<string, number>();
  gScores.set(posKey(from), 0);
  const closed = new Set<string>();

  while (open.length > 0) {
    // Pop node with lowest f (open is kept sorted)
    const current = open.shift()!;
    const currentKey = posKey(current.pos);

    if (closed.has(currentKey)) continue;
    closed.add(currentKey);

    // Reached the goal
    if (current.pos.x === to.x && current.pos.y === to.y) {
      const path: Pos[] = [];
      let node: Node | null = current;
      while (node !== null) {
        path.unshift(node.pos);
        node = node.parent;
      }
      return path;
    }

    const neighbors = getNeighbors(grid, current.pos, config);

    for (const neighborPos of neighbors) {
      const neighborKey = posKey(neighborPos);
      if (closed.has(neighborKey)) continue;

      const tentativeG = current.g + 1;  // uniform cost

      const existingG = gScores.get(neighborKey);
      if (existingG !== undefined && tentativeG >= existingG) continue;

      gScores.set(neighborKey, tentativeG);

      const h = chebyshev(neighborPos, to);
      const f = tentativeG + h;
      const node: Node = { pos: neighborPos, g: tentativeG, h, f, parent: current };

      // Insert into open array in sorted position
      let i = 0;
      while (i < open.length) {
        const other = open[i];
        if (f < other.f) break;
        if (f === other.f && h < other.h) break;
        if (f === other.f && h === other.h && neighborPos.y < other.pos.y) break;
        if (f === other.f && h === other.h && neighborPos.y === other.pos.y && neighborPos.x < other.pos.x) break;
        i++;
      }
      open.splice(i, 0, node);
    }
  }

  return null;  // no path found
}
