import { astar } from '../engine/astar.js';
import type { AiBehavior, Intent } from './types.js';

export const chaseAstar: AiBehavior = (ctx): Intent => {
  const { self, player, grid, config } = ctx;

  const path = astar(grid, self.pos, player.pos, config);

  if (!path || path.length < 2) return { type: 'none' };

  const next = path[1];
  return {
    type: 'move',
    dx: next.x - self.pos.x,
    dy: next.y - self.pos.y,
  };
};
