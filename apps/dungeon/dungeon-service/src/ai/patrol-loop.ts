import type { Pos } from '@org/shared';
import type { AiBehavior, Intent } from './types.js';

export const patrolLoop: AiBehavior = (ctx): Intent => {
  const { self } = ctx;

  const path = self.state['path'] as Pos[] | undefined;
  if (!path || path.length === 0) return { type: 'none' };

  let index = (self.state['index'] as number | undefined) ?? 0;

  const target = path[index];

  // If already at target (or close enough), advance index
  if (self.pos.x === target.x && self.pos.y === target.y) {
    index = (index + 1) % path.length;
    self.state['index'] = index;
  }

  const newTarget = path[index];
  const rawDx = newTarget.x - self.pos.x;
  const rawDy = newTarget.y - self.pos.y;

  // Unit vector clamped to -1/0/1
  const dx = rawDx === 0 ? 0 : rawDx > 0 ? 1 : -1;
  const dy = rawDy === 0 ? 0 : rawDy > 0 ? 1 : -1;

  if (dx === 0 && dy === 0) return { type: 'none' };

  return { type: 'move', dx, dy };
};
