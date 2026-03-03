import type { GameEvent, PlayerAction, RunState } from '../models/types.js';
import { DIR_TO_DELTA, entityAt, inBounds, isWall } from './grid.js';
import { applyAttack, findAdjacentTarget } from './combat.js';
import { resolvePickup } from './pickup.js';
import { aiRegistry } from '../ai/registry.js';

export function processTurn(
  state: RunState,
  action: PlayerAction
): { state: RunState; turnEvents: GameEvent[]; error?: string } {
  const s = structuredClone(state) as RunState;
  const turnEvents: GameEvent[] = [];

  // ─── Step 1: Player action ──────────────────────────────────────────────────
  const playerActionResult = resolvePlayerAction(s, action, turnEvents);
  if (playerActionResult.error) {
    return { state, turnEvents: [], error: playerActionResult.error };
  }

  // ─── Step 2: Increment overclock ────────────────────────────────────────────
  s.overclock += 1;

  // ─── Step 3: Player pickup ──────────────────────────────────────────────────
  const pickupEvents = resolvePickup(s.grid, s.player);
  turnEvents.push(...pickupEvents);

  // ─── Step 4: Enemy phase ─────────────────────────────────────────────────────
  s.enemies.sort((a, b) => a.id.localeCompare(b.id));

  for (const enemy of s.enemies) {
    if (enemy.hp <= 0) continue;

    const allEntities = [s.player, ...s.enemies.filter(e => e.hp > 0)];
    const ctx = {
      self: enemy,
      player: s.player,
      grid: s.grid,
      entities: allEntities,
      overclock: s.overclock,
      config: s.config,
    };

    const intent = aiRegistry[enemy.aiType ?? 'chase_astar'](ctx);

    if (intent.type === 'move' && intent.dx !== undefined && intent.dy !== undefined) {
      resolveEnemyMove(s, enemy, intent.dx, intent.dy, turnEvents);
    }

    // After movement: scan 8-neighbors for adjacent targets
    if (enemy.hp > 0) {
      const adjacentTarget = findAdjacentTarget(
        enemy.pos,
        s.player,
        s.enemies.filter(e => e.id !== enemy.id && e.hp > 0)
      );

      if (adjacentTarget) {
        const attackEvents = applyAttack(enemy.id, adjacentTarget, enemy.attackDamage, 'attack');
        turnEvents.push(...attackEvents);

        if (adjacentTarget.hp <= 0) {
          removeDeadEntity(s, adjacentTarget.id);
        }
      }
    }
  }

  // ─── Step 5: Hazard stub ──────────────────────────────────────────────────
  // (no-op hook point)

  // ─── Step 6: End state check ─────────────────────────────────────────────
  if (s.player.hp <= 0) {
    s.status = 'dead';
    const endEvent: GameEvent = { type: 'run_end', reason: 'dead' };
    turnEvents.push(endEvent);
  } else {
    const playerTile = s.grid[s.player.pos.y]?.[s.player.pos.x];
    if (playerTile?.type === 'exit') {
      s.status = 'extracted';
      const endEvent: GameEvent = { type: 'run_end', reason: 'extracted' };
      turnEvents.push(endEvent);
    }
  }

  s.events.push(...turnEvents);

  return { state: s, turnEvents };
}

function resolvePlayerAction(
  s: RunState,
  action: PlayerAction,
  turnEvents: GameEvent[]
): { error?: string } {
  turnEvents.push({ type: 'player_action', action });

  switch (action.type) {
    case 'move': {
      const { dx, dy } = DIR_TO_DELTA[action.dir];
      const tx = s.player.pos.x + dx;
      const ty = s.player.pos.y + dy;

      if (!inBounds(s.grid, tx, ty)) return { error: 'Move out of bounds' };
      if (isWall(s.grid, tx, ty)) return { error: 'Move blocked by wall' };

      const allEntities = [s.player, ...s.enemies];
      if (entityAt(allEntities.filter(e => e.id !== s.player.id), tx, ty)) {
        return { error: 'Move blocked by entity' };
      }

      const from = { ...s.player.pos };
      s.player.pos = { x: tx, y: ty };
      turnEvents.push({ type: 'move', entityId: s.player.id, from, to: { x: tx, y: ty } });
      return {};
    }

    case 'attack': {
      const { dx, dy } = DIR_TO_DELTA[action.dir];
      const tx = s.player.pos.x + dx;
      const ty = s.player.pos.y + dy;

      // Attack is always valid (even into empty/OOB)
      const target = entityAt(s.enemies, tx, ty);
      if (!target) {
        turnEvents.push({ type: 'noop', reason: 'attack on empty tile' });
        return {};
      }

      const attackEvents = applyAttack(s.player.id, target, s.player.attackDamage, 'attack');
      turnEvents.push(...attackEvents);

      if (target.hp <= 0) {
        removeDeadEntity(s, target.id);
      }
      return {};
    }

    case 'dash': {
      const { dx, dy } = DIR_TO_DELTA[action.dir];
      const allEnemies = s.enemies;

      // Check first step is clear
      const firstX = s.player.pos.x + dx;
      const firstY = s.player.pos.y + dy;
      if (!inBounds(s.grid, firstX, firstY) || isWall(s.grid, firstX, firstY)) {
        return { error: 'Dash blocked on first step' };
      }
      if (entityAt(allEnemies, firstX, firstY)) {
        return { error: 'Dash blocked on first step by entity' };
      }

      let finalX = s.player.pos.x;
      let finalY = s.player.pos.y;

      for (let step = 1; step <= s.config.dashDistance; step++) {
        const nx = s.player.pos.x + dx * step;
        const ny = s.player.pos.y + dy * step;

        if (!inBounds(s.grid, nx, ny) || isWall(s.grid, nx, ny)) break;
        if (entityAt(allEnemies, nx, ny)) break;

        finalX = nx;
        finalY = ny;
      }

      const from = { ...s.player.pos };
      s.player.pos = { x: finalX, y: finalY };
      turnEvents.push({ type: 'move', entityId: s.player.id, from, to: { x: finalX, y: finalY } });
      return {};
    }

    case 'useItem': {
      // Stub: consume turn
      turnEvents.push({ type: 'noop', reason: `useItem: ${action.itemId}` });
      return {};
    }

    case 'interact': {
      // Stub: consume turn
      turnEvents.push({ type: 'noop', reason: 'interact' });
      return {};
    }
  }
}

function resolveEnemyMove(
  s: RunState,
  enemy: (typeof s.enemies)[number],
  totalDx: number,
  totalDy: number,
  turnEvents: GameEvent[]
): void {
  // Determine step delta (unit vector)
  const unitDx = totalDx === 0 ? 0 : totalDx > 0 ? 1 : -1;
  const unitDy = totalDy === 0 ? 0 : totalDy > 0 ? 1 : -1;
  const magnitude = Math.max(Math.abs(totalDx), Math.abs(totalDy));

  for (let step = 0; step < magnitude; step++) {
    if (enemy.hp <= 0) break;

    const nx = enemy.pos.x + unitDx;
    const ny = enemy.pos.y + unitDy;

    if (!inBounds(s.grid, nx, ny) || isWall(s.grid, nx, ny)) {
      break;  // stop moving
    }

    // Check for entity at next position
    const occupant = entityAt(
      [s.player, ...s.enemies.filter(e => e.id !== enemy.id && e.hp > 0)],
      nx,
      ny
    );

    if (occupant) {
      // Collision attack
      const attackEvents = applyAttack(enemy.id, occupant, enemy.attackDamage, 'collision_attack');
      turnEvents.push(...attackEvents);

      if (occupant.hp <= 0) {
        removeDeadEntity(s, occupant.id);
      }

      break;  // stop movement chain
    }

    // Move enemy
    const from = { ...enemy.pos };
    enemy.pos = { x: nx, y: ny };
    turnEvents.push({ type: 'move', entityId: enemy.id, from, to: { x: nx, y: ny } });
  }
}

function removeDeadEntity(s: RunState, id: string): void {
  if (id === s.player.id) return;  // player death tracked via hp
  s.enemies = s.enemies.filter(e => e.id !== id);
}
