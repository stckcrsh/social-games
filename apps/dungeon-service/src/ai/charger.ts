import { astar } from '../engine/astar.js';
import type { AiBehavior, Intent } from './types.js';

export const charger: AiBehavior = (ctx): Intent => {
  const { self, player, grid, config } = ctx;

  const dx = player.pos.x - self.pos.x;
  const dy = player.pos.y - self.pos.y;

  // Check alignment: same row or same column
  const sameRow = dy === 0;
  const sameCol = dx === 0;

  if (sameRow || sameCol) {
    // Unit direction toward player
    const unitDx = dx === 0 ? 0 : dx > 0 ? 1 : -1;
    const unitDy = dy === 0 ? 0 : dy > 0 ? 1 : -1;

    return {
      type: 'move',
      dx: unitDx * config.chargerDashDistance,
      dy: unitDy * config.chargerDashDistance,
    };
  }

  // Not aligned — use A* like chase
  const path = astar(grid, self.pos, player.pos);
  if (!path || path.length < 2) return { type: 'none' };

  const next = path[1];
  return {
    type: 'move',
    dx: next.x - self.pos.x,
    dy: next.y - self.pos.y,
  };
};
