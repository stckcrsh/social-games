import type { Entity, GameEvent, Grid } from '@org/shared';

/** Collect all items on the player's current tile. Mutates grid and returns events. */
export function resolvePickup(grid: Grid, entity: Entity): GameEvent[] {
  const tile = grid[entity.pos.y][entity.pos.x];
  if (!tile || tile.items.length === 0) return [];

  const events: GameEvent[] = tile.items.map(item => ({
    type: 'pickup' as const,
    entityId: entity.id,
    item,
  }));

  tile.items = [];
  return events;
}
