import type { GameEvent, RunState } from '../models/types.js';
import { inBounds } from './grid.js';
import { applyEffect, hasEffect, removeEffect } from './effects.js';

export function resolveExplosions(s: RunState, turnEvents: GameEvent[]): void {
  const queue = s.pendingExplosions;
  s.pendingExplosions = [];

  for (const { x, y, radius } of queue) {
    turnEvents.push({ type: 'explosion', x, y, radius });

    for (let dy = -radius; dy <= radius; dy++) {
      for (let dx = -radius; dx <= radius; dx++) {
        const tx = x + dx;
        const ty = y + dy;
        if (!inBounds(s.grid, tx, ty)) continue;

        const tile = s.grid[ty][tx];

        if (tile.type === 'weakWall') {
          tile.type = 'floor';
          turnEvents.push({ type: 'explosion_wall_destroyed', x: tx, y: ty });
        }

        if (hasEffect(tile, 'oil')) {
          removeEffect(tile, 'oil');
          applyEffect(tile, { tag: 'fire', power: 1, duration: 2 });
          turnEvents.push({ type: 'oil_ignited', x: tx, y: ty });
        }

        for (const e of [s.player, ...s.enemies]) {
          if (e.pos.x === tx && e.pos.y === ty && e.hp > 0) {
            e.hp = Math.max(0, e.hp - 1);
            turnEvents.push({ type: 'explosion_entity_damage', entityId: e.id, x: tx, y: ty, amount: 1 });
          }
        }
      }
    }
  }
}
