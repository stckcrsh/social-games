import type { GameEvent, Grid, PlayerAction, RoomState, RunState, Slot, Tile } from '@org/shared';
import { DIR_TO_DELTA, entityAt, getTile, inBounds, isWall } from '@org/shared';
import { applyAttack, findAdjacentTarget } from './combat.js';
import { resolvePickup } from './pickup.js';
import { aiRegistry } from '../ai/registry.js';
import { evaluateMechanisms } from './mechanisms.js';
import { runEnvironmentalPhase } from './environment.js';
import { resolveItemActivation } from '@org/items';
import { computeReconcilePatch } from './reconcile.js';
import { writeOutboxRecord } from '../storage/outbox-store.js';
import { DATA_DIR } from '../config.js';

export function processTurn(
  state: RunState,
  action: PlayerAction
): { state: RunState; turnEvents: GameEvent[]; error?: string } {
  const s = structuredClone(state) as RunState;
  const turnEvents: GameEvent[] = [];

  // ─── switchSlot is free — no turn consumed ───────────────────────────────────
  if (action.type === 'switchSlot') {
    const newSlot: Slot = s.profile.loadout.activeSlot === 'A' ? 'B' : 'A';
    s.profile.loadout.activeSlot = newSlot;
    const ev: GameEvent = { type: 'slot_switched', slot: newSlot };
    turnEvents.push(ev);
    s.events.push(ev);
    return { state: s, turnEvents };
  }

  // ─── Step 1: Player action ──────────────────────────────────────────────────
  const playerActionResult = resolvePlayerAction(s, action, turnEvents);
  if (playerActionResult.error) {
    return { state, turnEvents: [], error: playerActionResult.error };
  }

  // ─── Step 1.5: Portal / room transition check ────────────────────────────────
  checkPortalTransition(s, turnEvents);

  // ─── Step 1b: Mechanism evaluation ──────────────────────────────────────────
  evaluateMechanisms(s, turnEvents, s.config.nameIndex ?? {});

  // ─── Step 2: Cross-room mechanism evaluation ─────────────────────────────────
  evaluateCrossRoomMechanisms(s, turnEvents);

  // ─── Step 3: Increment overclock ────────────────────────────────────────────
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

  // ─── Step 5: Environmental phase ─────────────────────────────────────────
  runEnvironmentalPhase(s, turnEvents);

  // ─── Step 5b: Tick item cooldowns ────────────────────────────────────────
  for (const slot of (['A', 'B'] as Slot[])) {
    const st = s.runItemState[slot];
    if ((st.cooldown ?? 0) > 0) st.cooldown = Math.max(0, st.cooldown! - 1);
  }

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

  if (s.status !== 'active' && !s.reconcilePatch) {
    s.reconcilePatch = computeReconcilePatch(s);
    void writeOutboxRecord(DATA_DIR, {
      runId: s.id,
      patch: s.reconcilePatch,
      status: 'pending',
      attempts: 0,
    }).catch(() => { /* best-effort: outbox dir may not exist yet */ });
  }

  s.events.push(...turnEvents);

  return { state: s, turnEvents };
}

function evaluateCrossRoomMechanisms(state: RunState, events: GameEvent[]): void {
  for (const [_roomId, room] of Object.entries(state.rooms)) {
    for (const mechanism of room.mechanisms) {
      if (!mechanism.triggers || mechanism.triggers.length === 0) continue;
      if (mechanism.satisfied) continue;

      const triggered = mechanism.triggers.some(m => {
        if (m.kind !== 'cross_room') return false;
        if (m.sourceMapId !== state.currentRoomId) return false;
        // Check if active room's events contain the triggering interactable event
        return events.some(e =>
          e.type === 'interacted' && e.interactableId === m.triggerPointId
        );
      });

      if (!triggered) continue;

      mechanism.satisfied = true;

      for (const effect of mechanism.effects) {
        if (effect.type === 'tile_change' && effect.x != null && effect.y != null) {
          const tile = getTile(room.grid, effect.x, effect.y);
          if (!tile) continue;
          const from = tile.type;
          tile.type = effect.to;
          if (from !== effect.to) {
            events.push({ type: 'tile_changed', x: effect.x, y: effect.y, from, to: effect.to });
          }
        }
      }

      events.push({ type: 'mechanism_solved', mechanismId: mechanism.id });
    }
  }
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

    case 'useActive': {
      return resolveItemActivation(s, action.dir, turnEvents);
    }

    case 'switchSlot': {
      // Handled before resolvePlayerAction — should never reach here
      return {};
    }

    case 'interact': {
      const candidates = [
        s.player.pos,
        { x: s.player.pos.x,     y: s.player.pos.y - 1 },
        { x: s.player.pos.x + 1, y: s.player.pos.y     },
        { x: s.player.pos.x,     y: s.player.pos.y + 1 },
        { x: s.player.pos.x - 1, y: s.player.pos.y     },
      ];

      let targetTile: Tile | null = null;
      for (const pos of candidates) {
        const tile = getTile(s.grid, pos.x, pos.y);
        if (tile?.type === 'interactable' && tile.interactable) {
          targetTile = tile;
          break;
        }
      }

      if (!targetTile) {
        turnEvents.push({ type: 'noop', reason: 'no interactable nearby' });
        return {};
      }

      const def = targetTile.interactable!;

      if (def.kind === 'terminal') {
        turnEvents.push({ type: 'noop', reason: 'terminal requires electric activation' });
        return {};
      }

      if (def.kind === 'switch' && def.state > 0) {
        turnEvents.push({ type: 'noop', reason: `${def.label} is already activated` });
        return {};
      }

      def.state = (def.state + 1) % def.stateCount;

      turnEvents.push({
        type: 'interacted',
        entityId: s.player.id,
        interactableId: def.id,
        kind: def.kind,
        label: def.label,
        newState: def.state,
      });

      return {};
    }

    case 'wait': {
      // No-op: consume turn, enemies still act
      turnEvents.push({ type: 'noop', reason: 'wait' });
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

function checkPortalTransition(state: RunState, events: GameEvent[]): void {
  const { x, y } = state.player.pos;
  const tile = getTile(state.grid, x, y) as (Tile & Record<string, unknown>) | undefined;
  if (!tile) return;

  const portal = tile['portal'] as {
    name: string;
    targetMapId: string;
    targetEnterId: string;
  } | undefined;
  if (!portal || !portal.targetMapId) return;

  // Freeze current room into state.rooms
  const frozen: RoomState = {
    mapId: state.currentRoomId,
    grid: state.grid,
    enemies: state.enemies,
    mechanisms: state.mechanisms,
    pendingExplosions: state.pendingExplosions,
  };
  state.rooms = { ...state.rooms, [state.currentRoomId]: frozen };

  // Load target room
  const targetRoom = state.rooms[portal.targetMapId];
  if (!targetRoom) {
    console.warn(`[room transition] target room '${portal.targetMapId}' not in state.rooms — staying`);
    // Undo the freeze (restore current room)
    const { [state.currentRoomId]: _removed, ...rest } = state.rooms;
    state.rooms = rest;
    return;
  }

  // Activate target room
  state.grid = targetRoom.grid;
  state.enemies = targetRoom.enemies;
  state.mechanisms = targetRoom.mechanisms;
  state.pendingExplosions = targetRoom.pendingExplosions;

  // Remove target room from frozen rooms (it's now active)
  const { [portal.targetMapId]: _activated, ...remainingRooms } = state.rooms;
  state.rooms = remainingRooms;

  // Find player spawn in new room
  const enterPos = findEnterPoint(state.grid, portal.targetEnterId) ?? { x: 1, y: 1 };
  state.player = { ...state.player, pos: enterPos };
  state.currentRoomId = portal.targetMapId;

  events.push({
    type: 'room_transition',
    fromMapId: frozen.mapId,
    toMapId: portal.targetMapId,
    enterId: portal.targetEnterId,
  });
}

function findEnterPoint(grid: Grid, enterId: string): { x: number; y: number } | null {
  for (let y = 0; y < grid.length; y++) {
    for (let x = 0; x < grid[y].length; x++) {
      const tile = grid[y][x] as Tile & Record<string, unknown>;
      const p = tile['portal'] as { name?: string; type?: string } | undefined;
      if (p?.name === enterId) return { x, y };
    }
  }
  return null;
}
