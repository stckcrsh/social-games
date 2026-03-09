import type { AiType } from '@org/shared';
import type { AiBehavior } from './types.js';
import { chaseAstar } from './chase-astar.js';
import { patrolLoop } from './patrol-loop.js';
import { charger } from './charger.js';

export const aiRegistry: Record<AiType, AiBehavior> = {
  chase_astar: chaseAstar,
  patrol_loop: patrolLoop,
  charger:     charger,
};
