import { describe, it, expect } from 'vitest';
import { computeReconcilePatch } from './reconcile.js';
import type { Entity, Grid, RunConfig, RunState, StartReceipt, Tile } from '@org/shared';

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

const DEFAULT_PLAYER: Entity = {
  id: 'player',
  kind: 'player',
  pos: { x: 1, y: 1 },
  hp: 0,
  maxHp: 20,
  attackDamage: 5,
  state: {},
};

function makeReceipt(overrides: Partial<StartReceipt> = {}): StartReceipt {
  return {
    runId: 'test-run',
    preset: 'open',
    createdAt: 0,
    packed: { instances: [], stacks: {} },
    capacity: { maxSlots: 2, rules: { ammoMaxStack: 99, ammoOccupiesSlots: 0 } },
    metaMode: 'bypass',
    ...overrides,
  };
}

function makeState(overrides: Partial<RunState> = {}): RunState {
  return {
    id: 'test-run',
    currentRoomId: 'room-default',
    rooms: {},
    grid: makeFloorGrid(10, 10),
    player: DEFAULT_PLAYER,
    enemies: [],
    overclock: 5,
    events: [],
    status: 'dead',
    config: DEFAULT_CONFIG,
    mechanisms: [],
    pendingExplosions: [],
    runItemState: { A: {}, B: {} },
    profile: { inventory: {}, loadout: { slotA: null, slotB: null, activeSlot: 'A' as const } },
    startReceipt: makeReceipt(),
    ...overrides,
  };
}

describe('computeReconcilePatch', () => {
  it('dead run: consumes all escrowed stacks, grants nothing', () => {
    const state = makeState({
      status: 'dead',
      startReceipt: makeReceipt({
        packed: {
          instances: [],
          stacks: { ammo_rivet: { qty: 10 }, scrap: { qty: 5 } },
        },
      }),
    });

    const patch = computeReconcilePatch(state);

    expect(patch.result).toBe('dead');
    expect(patch.consume.stacks).toEqual({ ammo_rivet: 10, scrap: 5 });
    expect(patch.grant.stacks).toEqual({});
    expect(patch.consume.instances).toEqual([]);
    expect(patch.grant.instances).toEqual([]);
  });

  it('extracted run: nothing consumed, nothing granted', () => {
    const state = makeState({
      status: 'extracted',
      startReceipt: makeReceipt({
        packed: {
          instances: [],
          stacks: { ammo_rivet: { qty: 10 } },
        },
      }),
    });

    const patch = computeReconcilePatch(state);

    expect(patch.result).toBe('extracted');
    expect(patch.consume.stacks).toEqual({});
    expect(patch.grant.stacks).toEqual({});
  });

  it('dead run with no packed stacks: consume entries empty', () => {
    const state = makeState({ status: 'dead' });

    const patch = computeReconcilePatch(state);

    expect(patch.result).toBe('dead');
    expect(patch.consume.stacks).toEqual({});
  });

  it('patch includes runId, escrowId, playerId, and createdAt', () => {
    const state = makeState({
      id: 'run-abc',
      status: 'dead',
      startReceipt: makeReceipt({
        runId: 'run-abc',
        escrowId: 'escrow-xyz',
        playerId: 'player-123',
      }),
    });

    const patch = computeReconcilePatch(state);

    expect(patch.runId).toBe('run-abc');
    expect(patch.escrowId).toBe('escrow-xyz');
    expect(patch.playerId).toBe('player-123');
    expect(typeof patch.createdAt).toBe('number');
  });

  it('patch has empty durabilityUpdates', () => {
    const state = makeState({ status: 'dead' });
    const patch = computeReconcilePatch(state);
    expect(patch.durabilityUpdates).toEqual([]);
  });
});
