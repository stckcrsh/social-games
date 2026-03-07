import { describe, it, expect } from 'vitest';
import { runEnvironmentalPhase } from './environment.js';
import type { Entity, GameEvent, Grid, RunConfig, RunState, Tile } from '@org/shared';

function makeFloorGrid(width: number, height: number): Grid {
  return Array.from({ length: height }, (_, y) =>
    Array.from({ length: width }, (_, x) => {
      const isEdge = x === 0 || y === 0 || x === width - 1 || y === height - 1;
      return { type: isEdge ? 'wall' : 'floor', items: [], effects: [] } as Tile;
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

function makePlayer(x: number, y: number, hp = 20): Entity {
  return { id: 'player', kind: 'player', pos: { x, y }, hp, maxHp: 20, attackDamage: 5, state: {} };
}

function makeState(overrides: Partial<RunState> = {}): RunState {
  const grid = makeFloorGrid(10, 10);
  return {
    id: 'run-test',
    currentRoomId: 'room-default',
    rooms: {},
    grid,
    player: makePlayer(1, 1),
    enemies: [],
    overclock: 0,
    events: [],
    status: 'active',
    config: DEFAULT_CONFIG,
    mechanisms: [],
    pendingExplosions: [],
    runItemState: { A: {}, B: {} },
    profile: { inventory: {}, loadout: { slotA: null, slotB: null, activeSlot: 'A' as const } },
    startReceipt: {
      runId: 'run-test',
      preset: 'open',
      createdAt: 0,
      packed: { instances: [], stacks: {} },
      capacity: { maxSlots: 2, rules: { ammoMaxStack: 99, ammoOccupiesSlots: 0 } },
      metaMode: 'bypass',
    },
    ...overrides,
  };
}

describe('effects', () => {
  it('fire damages entity on fire tile', () => {
    const state = makeState({ player: makePlayer(5, 5) });
    // Place fire(power=2) on player's tile
    state.grid[5][5].effects.push({ tag: 'fire', power: 2, duration: 3 });

    const events: GameEvent[] = [];
    runEnvironmentalPhase(state, events);

    expect(state.player.hp).toBe(18);
    const dmgEv = events.find(e => e.type === 'fire_damage');
    expect(dmgEv).toBeDefined();
    if (dmgEv && dmgEv.type === 'fire_damage') {
      expect(dmgEv.amount).toBe(2);
      expect(dmgEv.entityId).toBe('player');
    }
  });

  it('fire spreads only to oil neighbors, not plain floor', () => {
    const state = makeState({ player: makePlayer(1, 1) });
    // Fire at (5,5), oil at (5,4) [N neighbor], plain floor at (6,5) [E neighbor]
    state.grid[5][5].effects.push({ tag: 'fire', power: 1, duration: 3 });
    state.grid[4][5].effects.push({ tag: 'oil' });

    const events: GameEvent[] = [];
    runEnvironmentalPhase(state, events);

    // Oil at (5,4) should have been consumed and replaced by fire
    expect(state.grid[4][5].effects.some(e => e.tag === 'oil')).toBe(false);
    expect(state.grid[4][5].effects.some(e => e.tag === 'fire')).toBe(true);

    // Plain floor at (6,5) should have no effects
    expect(state.grid[5][6].effects.length).toBe(0);

    const spreadEv = events.find(e => e.type === 'fire_spread');
    expect(spreadEv).toBeDefined();
    if (spreadEv && spreadEv.type === 'fire_spread') {
      expect(spreadEv.toX).toBe(5);
      expect(spreadEv.toY).toBe(4);
    }
  });

  it('explosion destroys weakWall and ignites oil in AoE', () => {
    const state = makeState({ player: makePlayer(1, 1) });
    state.grid[5][5] = { type: 'weakWall', items: [], effects: [] };
    state.grid[5][6].effects.push({ tag: 'oil' });
    state.pendingExplosions.push({ x: 5, y: 5, radius: 2 });

    const events: GameEvent[] = [];
    runEnvironmentalPhase(state, events);

    // weakWall at (5,5) should be destroyed
    expect(state.grid[5][5].type).toBe('floor');
    expect(events.some(e => e.type === 'explosion_wall_destroyed')).toBe(true);

    // Oil at (6,5) should be ignited
    expect(state.grid[5][6].effects.some(e => e.tag === 'fire')).toBe(true);
    expect(events.some(e => e.type === 'oil_ignited')).toBe(true);
  });

  it('explosion ignites oil BEFORE fire ticks — oil_ignited event before fire_spread', () => {
    // Place oil at (5,5) and fire at (4,5) (W neighbor of oil)
    // Explosion at (5,5) radius 1: oil_ignited at (5,5)
    // Then fire phase runs: fire at (4,5) spreads to oil... but (5,5) oil is already gone/converted
    // The key ordering: oil_ignited event (from explosion phase) comes before any fire_spread events
    const state = makeState({ player: makePlayer(1, 1) });
    state.grid[5][5].effects.push({ tag: 'oil' });
    state.grid[5][4].effects.push({ tag: 'fire', power: 1, duration: 3 });
    state.pendingExplosions.push({ x: 5, y: 5, radius: 1 });

    const events: GameEvent[] = [];
    runEnvironmentalPhase(state, events);

    const oilIdx = events.findIndex(e => e.type === 'oil_ignited');
    const spreadIdx = events.findIndex(e => e.type === 'fire_spread');

    expect(oilIdx).toBeGreaterThanOrEqual(0);
    // fire_spread may or may not occur (oil at (5,5) was consumed by explosion),
    // but if it does, oil_ignited must come first
    if (spreadIdx >= 0) {
      expect(oilIdx).toBeLessThan(spreadIdx);
    }
  });

  it('ring of 8 oil tiles all ignite in N→NE→E→SE→S→SW→W→NW spread order', () => {
    const state = makeState({ player: makePlayer(1, 1) });
    // Fire at center (5,5), oil at all 8 neighbors
    state.grid[5][5].effects.push({ tag: 'fire', power: 1, duration: 3 });
    const ring = [
      { x: 5, y: 4 }, // N
      { x: 6, y: 4 }, // NE
      { x: 6, y: 5 }, // E
      { x: 6, y: 6 }, // SE
      { x: 5, y: 6 }, // S
      { x: 4, y: 6 }, // SW
      { x: 4, y: 5 }, // W
      { x: 4, y: 4 }, // NW
    ];
    for (const { x, y } of ring) {
      state.grid[y][x].effects.push({ tag: 'oil' });
    }

    const events: GameEvent[] = [];
    runEnvironmentalPhase(state, events);

    const spreadEvents = events.filter(e => e.type === 'fire_spread');
    expect(spreadEvents.length).toBe(8);

    // Verify spread order matches N→NE→E→SE→S→SW→W→NW
    for (let i = 0; i < ring.length; i++) {
      const ev = spreadEvents[i];
      if (ev.type === 'fire_spread') {
        expect(ev.toX).toBe(ring[i].x);
        expect(ev.toY).toBe(ring[i].y);
      }
    }
  });
});
