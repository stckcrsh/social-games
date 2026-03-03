import { describe, it, expect } from 'vitest';
import { processTurn } from './turn.js';
import type { Entity, Grid, RunConfig, RunState, Tile } from '../models/types.js';

function makeFloorGrid(width: number, height: number): Grid {
  return Array.from({ length: height }, (_, y) =>
    Array.from({ length: width }, (_, x) => {
      const isEdge = x === 0 || y === 0 || x === width - 1 || y === height - 1;
      return { type: isEdge ? 'wall' : 'floor', items: [] } as Tile;
    })
  );
}

const DEFAULT_CONFIG: RunConfig = {
  width: 10,
  height: 10,
  allowDiagonalCornerCutting: false,
  dashDistance: 2,
  chargerDashDistance: 2,
};

function makeState(overrides: Partial<RunState> = {}): RunState {
  const grid = makeFloorGrid(10, 10);
  const player: Entity = {
    id: 'player',
    kind: 'player',
    pos: { x: 1, y: 1 },
    hp: 20,
    maxHp: 20,
    attackDamage: 5,
    state: {},
  };
  return {
    id: 'run-1',
    grid,
    player,
    enemies: [],
    overclock: 0,
    events: [],
    status: 'active',
    config: DEFAULT_CONFIG,
    ...overrides,
  };
}

function makeEnemy(id: string, x: number, y: number, hp = 10): Entity {
  return {
    id,
    kind: 'enemy',
    pos: { x, y },
    hp,
    maxHp: 10,
    attackDamage: 3,
    aiType: 'chase_astar',
    state: {},
  };
}

describe('turn processing', () => {
  it('enemies are processed in ascending id order', () => {
    // Place enemies in reverse id order; expect processing by sorted id
    const enemyZ = makeEnemy('enemy-z', 5, 5);
    const enemyA = makeEnemy('enemy-a', 5, 3);
    const state = makeState({
      player: { ...makeState().player, pos: { x: 5, y: 1 } },
      // Provide enemies in non-sorted order
      enemies: [enemyZ, enemyA],
    });

    const { state: next, turnEvents } = processTurn(state, { type: 'move', dir: 'E' });

    // Both enemies should have moved; the move events should appear in id-sorted order (enemy-a, enemy-z)
    const moveEvents = turnEvents.filter(e => e.type === 'move' && e.entityId !== 'player');
    expect(moveEvents.length).toBeGreaterThan(0);
    if (moveEvents.length >= 2) {
      const ids = moveEvents.map(e => (e as { entityId: string }).entityId);
      // enemy-a should appear before enemy-z
      expect(ids.indexOf('enemy-a')).toBeLessThan(ids.indexOf('enemy-z'));
    }
    // Also verify state enemies sorted
    expect(next.enemies[0].id.localeCompare(next.enemies[1]?.id ?? 'z')).toBeLessThanOrEqual(0);
  });

  it('enemy collision attack on another enemy deals damage and removes if hp=0', () => {
    // Use a single-row corridor so enemy-a can only move east.
    // Layout (width=12, height=3):
    //   ############
    //   #aB........P#  y=1
    //   ############
    // enemy-a at (1,1) chases player at (10,1); path[1]=(2,1) where enemy-b sits → collision.
    const W = 12;
    const corridorGrid: Grid = Array.from({ length: 3 }, (_, y) =>
      Array.from({ length: W }, (_, x) => ({
        type: (y === 0 || y === 2 || x === 0 || x === W - 1) ? 'wall' : 'floor',
        items: [],
      } as Tile))
    );

    const corridorConfig: RunConfig = { ...DEFAULT_CONFIG, width: W, height: 3 };

    const enemyA = { ...makeEnemy('enemy-a', 1, 1), hp: 5, attackDamage: 10 };
    const enemyB = { ...makeEnemy('enemy-b', 2, 1), hp: 5 };

    const state: RunState = {
      id: 'run-collision',
      grid: corridorGrid,
      player: { ...makeState().player, pos: { x: 10, y: 1 } },
      enemies: [enemyA, enemyB],
      overclock: 0,
      events: [],
      status: 'active',
      config: corridorConfig,
    };

    const { turnEvents } = processTurn(state, { type: 'interact' }); // stub action — still advances turn

    const collisionEvent = turnEvents.find(e => e.type === 'collision_attack');
    expect(collisionEvent).toBeDefined();
    if (collisionEvent && collisionEvent.type === 'collision_attack') {
      expect(collisionEvent.attackerId).toBe('enemy-a');
      expect(collisionEvent.targetId).toBe('enemy-b');
    }

    // enemy-b has 5hp, enemy-a attackDamage=10 → enemy-b dies
    const deathEvent = turnEvents.find(e => e.type === 'death' && e.entityId === 'enemy-b');
    expect(deathEvent).toBeDefined();
  });

  it('overclock increments exactly once per valid player action', () => {
    const state = makeState();
    const { state: next } = processTurn(state, { type: 'move', dir: 'E' });
    expect(next.overclock).toBe(1);

    const { state: next2 } = processTurn(next, { type: 'move', dir: 'S' });
    expect(next2.overclock).toBe(2);
  });

  it('invalid player move into wall returns error, state unchanged, overclock not changed', () => {
    // Grid has walls on edges. Player at (1,1). Moving N would go to (1,0) which is wall.
    const state = makeState();
    const { state: returned, error } = processTurn(state, { type: 'move', dir: 'N' });

    expect(error).toBeDefined();
    expect(returned).toBe(state);  // same reference — original state returned
    expect(returned.overclock).toBe(0);
  });

  it('player on exit tile after move → status extracted', () => {
    const grid = makeFloorGrid(10, 10);
    // Place exit at (3,1)
    grid[1][3] = { type: 'exit', items: [] };

    const state = makeState({
      grid,
      player: { ...makeState().player, pos: { x: 2, y: 1 } },
    });

    const { state: next } = processTurn(state, { type: 'move', dir: 'E' });

    expect(next.status).toBe('extracted');
    const runEndEvent = next.events.find(e => e.type === 'run_end');
    expect(runEndEvent).toBeDefined();
    if (runEndEvent && runEndEvent.type === 'run_end') {
      expect(runEndEvent.reason).toBe('extracted');
    }
  });
});
