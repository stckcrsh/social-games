import { describe, it, expect } from 'vitest';
import { processTurn } from './turn.js';
import type { Entity, Grid, RunConfig, RunState, Tile } from '@org/shared';

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
    currentRoomId: 'room-default',
    rooms: {},
    grid,
    player,
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
      runId: 'run-1',
      preset: 'open',
      createdAt: 0,
      packed: { instances: [], stacks: {} },
      capacity: { maxSlots: 2, rules: { ammoMaxStack: 99, ammoOccupiesSlots: 0 } },
      metaMode: 'bypass',
    },
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

describe('item system', () => {
  it('new run resets runItemState', () => {
    const state = makeState();
    expect(state.runItemState).toEqual({ A: {}, B: {} });
    expect(state.runItemState.A.mode).toBeUndefined();
    expect(state.runItemState.A.cooldown).toBeUndefined();
    expect(state.runItemState.B.mode).toBeUndefined();
    expect(state.runItemState.B.cooldown).toBeUndefined();
  });

  it('remote_mine mode is per-run: placing mine does not affect fresh state', () => {
    // Start with remote_mine in slot A
    const state = makeState({
      profile: {
        inventory: {},
        loadout: { slotA: 'remote_mine', slotB: null, activeSlot: 'A' as const },
      },
    });

    // Place mine east of player (1,1) → (2,1)
    const { state: next } = processTurn(state, { type: 'useActive', dir: 'E' });
    expect(next.runItemState.A.mode).toBe('placed');

    // Fresh state should have no mode
    const freshState = makeState({
      profile: {
        inventory: {},
        loadout: { slotA: 'remote_mine', slotB: null, activeSlot: 'A' as const },
      },
    });
    expect(freshState.runItemState.A.mode).toBeUndefined();
  });

  it('rivet_gun consumes ammo_rivet on successful use', () => {
    const enemy = makeEnemy('enemy-1', 3, 1); // 2 tiles east of player at (1,1)
    const state = makeState({
      enemies: [enemy],
      profile: {
        inventory: { ammo_rivet: 5 },
        loadout: { slotA: 'rivet_gun', slotB: null, activeSlot: 'A' as const },
      },
    });

    const { state: next, turnEvents } = processTurn(state, { type: 'useActive', dir: 'E' });

    const hitEvent = turnEvents.find(e => e.type === 'item_hit');
    expect(hitEvent).toBeDefined();
    expect(next.profile.inventory['ammo_rivet']).toBe(4);
  });

  it('insufficient ammo: item_fail emitted and turn is consumed (overclock increments)', () => {
    const state = makeState({
      profile: {
        inventory: { ammo_rivet: 0 },
        loadout: { slotA: 'rivet_gun', slotB: null, activeSlot: 'A' as const },
      },
    });

    const { state: next, turnEvents } = processTurn(state, { type: 'useActive', dir: 'E' });

    const failEvent = turnEvents.find(e => e.type === 'item_fail');
    expect(failEvent).toBeDefined();
    if (failEvent && failEvent.type === 'item_fail') {
      expect(failEvent.reason).toBe('no-ammo');
    }
    expect(next.overclock).toBe(1);
  });

  it('cooldown blocks use, ticks down each turn, then succeeds', () => {
    // Set rivet_gun with cooldown=2 manually
    const state = makeState({
      profile: {
        inventory: { ammo_rivet: 10 },
        loadout: { slotA: 'rivet_gun', slotB: null, activeSlot: 'A' as const },
      },
      runItemState: { A: { cooldown: 2 }, B: {} },
    });

    // Turn 1: blocked by cooldown
    const { state: s1, turnEvents: ev1 } = processTurn(state, { type: 'useActive', dir: 'E' });
    const fail1 = ev1.find(e => e.type === 'item_fail');
    expect(fail1).toBeDefined();
    if (fail1 && fail1.type === 'item_fail') {
      expect(fail1.reason).toBe('cooldown');
    }
    // Cooldown ticks: 2 → 1
    expect(s1.runItemState.A.cooldown).toBe(1);

    // Turn 2: still blocked, ticks to 0
    const { state: s2, turnEvents: ev2 } = processTurn(s1, { type: 'useActive', dir: 'E' });
    const fail2 = ev2.find(e => e.type === 'item_fail');
    expect(fail2).toBeDefined();
    expect(s2.runItemState.A.cooldown).toBe(0);

    // Turn 3: cooldown is 0, succeeds (whiff since no enemy, but activates)
    const { turnEvents: ev3 } = processTurn(s2, { type: 'useActive', dir: 'E' });
    const activate3 = ev3.find(e => e.type === 'item_activate');
    expect(activate3).toBeDefined();
    // No fail event
    expect(ev3.find(e => e.type === 'item_fail')).toBeUndefined();
  });
});
