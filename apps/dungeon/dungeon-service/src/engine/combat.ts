import type { Entity, GameEvent, Pos } from '@org/shared';

/** Apply attack damage to target. Returns death event if target dies. */
export function applyAttack(
  attackerId: string,
  target: Entity,
  damage: number,
  eventType: 'attack' | 'collision_attack'
): GameEvent[] {
  const events: GameEvent[] = [];

  target.hp -= damage;
  events.push({ type: eventType, attackerId, targetId: target.id, damage });

  if (target.hp <= 0) {
    target.hp = 0;
    events.push({ type: 'death', entityId: target.id });
  }

  return events;
}

/** Find entity adjacent (8-dir) to pos. Player preferred over enemies. */
export function findAdjacentTarget(
  pos: Pos,
  player: Entity,
  enemies: Entity[]
): Entity | undefined {
  const isAdjacent = (a: Pos, b: Pos) =>
    Math.abs(a.x - b.x) <= 1 && Math.abs(a.y - b.y) <= 1 && !(a.x === b.x && a.y === b.y);

  if (isAdjacent(pos, player.pos) && player.hp > 0) return player;

  return enemies.find(e => e.hp > 0 && isAdjacent(pos, e.pos));
}
