import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { AnimationScheduler } from './AnimationScheduler.js';
import { emptyAnimationState } from './AnimationState.js';
import type { GameEvent, RunState } from '@org/shared';

// Minimal RunState for testing
// Entity.state is Record<string, unknown> (AI memory), not a string literal
function mockState(overrides: Partial<{ enemyPos: { id: string; pos: { x: number; y: number } } }> = {}): RunState {
  const enemies = overrides.enemyPos
    ? [{ id: overrides.enemyPos.id, pos: overrides.enemyPos.pos, hp: 5, maxHp: 5, attackDamage: 1, aiType: 'chase_astar' as const, kind: 'enemy' as const, state: {} }]
    : [];
  return {
    player: { id: 'player', pos: { x: 2, y: 2 }, hp: 10, maxHp: 10, attackDamage: 2, aiType: 'chase_astar' as const, kind: 'player' as const, state: {} },
    enemies,
    grid: [],
    mechanisms: [],
    id: 'run1',
    currentRoomId: 'r1',
    rooms: {},
    overclock: 1,
    events: [],
    status: 'active',
    config: {} as any,
    pendingExplosions: [],
    profile: {} as any,
    runItemState: {} as any,
    startReceipt: {} as any,
  } as unknown as RunState;
}

function ev<T extends GameEvent['type']>(
  type: T,
  extra: Omit<Extract<GameEvent, { type: T }>, 'type'>,
): Extract<GameEvent, { type: T }> {
  return { type, ...extra } as Extract<GameEvent, { type: T }>;
}

describe('AnimationScheduler', () => {
  let scheduler: AnimationScheduler;

  beforeEach(() => {
    vi.useFakeTimers();
    scheduler = new AnimationScheduler();
  });

  afterEach(() => {
    scheduler.cancel();
    vi.useRealTimers();
  });

  it('calls onComplete immediately when all events map to skip', () => {
    const animState = emptyAnimationState();
    const onComplete = vi.fn();
    scheduler.run(
      [ev('noop', { reason: 'nothing' })],
      animState, mockState(), onComplete, vi.fn(),
    );
    expect(onComplete).toHaveBeenCalledOnce();
    expect(animState.done).toBe(true);
  });

  it('calls onComplete after action duration for a move-only turn', () => {
    const animState = emptyAnimationState();
    const onComplete = vi.fn();
    scheduler.run(
      [ev('move', { entityId: 'player', from: { x: 1, y: 1 }, to: { x: 2, y: 1 } })],
      animState, mockState(), onComplete, vi.fn(),
    );
    expect(onComplete).not.toHaveBeenCalled();
    vi.advanceTimersByTime(150); // action duration
    expect(onComplete).toHaveBeenCalledOnce();
  });

  it('impact phase starts after action leadTime (80ms), not after action duration (150ms)', () => {
    const animState = emptyAnimationState();
    scheduler.run(
      [
        ev('move', { entityId: 'player', from: { x: 1, y: 1 }, to: { x: 2, y: 1 } }),
        ev('attack', { attackerId: 'player', targetId: 'e1', damage: 3 }),
      ],
      animState,
      mockState({ enemyPos: { id: 'e1', pos: { x: 3, y: 1 } } }),
      vi.fn(), vi.fn(),
    );
    expect(animState.activePhase).toBe('action');
    vi.advanceTimersByTime(79);
    expect(animState.activePhase).toBe('action'); // not yet
    vi.advanceTimersByTime(1);
    expect(animState.activePhase).toBe('impact'); // leadTime of action = 80ms
  });

  it('onComplete fires only after the last phase ends (action + consequence turn)', () => {
    // action leadTime=80, consequence starts at 80ms, duration=180ms → ends at 260ms
    const animState = emptyAnimationState();
    const onComplete = vi.fn();
    scheduler.run(
      [
        ev('move', { entityId: 'player', from: { x: 1, y: 1 }, to: { x: 2, y: 1 } }),
        ev('death', { entityId: 'e1' }),
      ],
      animState, mockState(), onComplete, vi.fn(),
    );
    vi.advanceTimersByTime(259);
    expect(onComplete).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(onComplete).toHaveBeenCalledOnce();
  });

  it('cut-and-replace: first onComplete never fires after run() is called again', () => {
    const animState1 = emptyAnimationState();
    const onComplete1 = vi.fn();
    scheduler.run(
      [ev('move', { entityId: 'player', from: { x: 1, y: 1 }, to: { x: 2, y: 1 } })],
      animState1, mockState(), onComplete1, vi.fn(),
    );
    vi.advanceTimersByTime(50); // mid-animation

    const animState2 = emptyAnimationState();
    const onComplete2 = vi.fn();
    scheduler.run(
      [ev('move', { entityId: 'player', from: { x: 2, y: 1 }, to: { x: 3, y: 1 } })],
      animState2, mockState(), onComplete2, vi.fn(),
    );

    vi.advanceTimersByTime(500);
    expect(onComplete1).not.toHaveBeenCalled();
    expect(onComplete2).toHaveBeenCalledOnce();
  });

  it('instant option: onComplete called synchronously, done=true immediately', () => {
    const animState = emptyAnimationState();
    const onComplete = vi.fn();
    scheduler.run(
      [ev('move', { entityId: 'player', from: { x: 1, y: 1 }, to: { x: 2, y: 1 } })],
      animState, mockState(), onComplete, vi.fn(), { instant: true },
    );
    expect(onComplete).toHaveBeenCalledOnce();
    expect(animState.done).toBe(true);
  });

  it('emits slotFlash for slot_switched', () => {
    const onHud = vi.fn();
    scheduler.run(
      [ev('slot_switched', { slot: 'B' })],
      emptyAnimationState(), mockState(), vi.fn(), onHud,
    );
    expect(onHud).toHaveBeenCalledWith({ type: 'slotFlash' });
  });

  it('emits itemFail with reason for item_fail', () => {
    const onHud = vi.fn();
    scheduler.run(
      [ev('item_fail', { slot: 'A', itemId: 'hammer', reason: 'no-ammo' })],
      emptyAnimationState(), mockState(), vi.fn(), onHud,
    );
    expect(onHud).toHaveBeenCalledWith({ type: 'itemFail', reason: 'no-ammo' });
  });

  it('emits itemWhiff for item_whiff', () => {
    const onHud = vi.fn();
    scheduler.run(
      [ev('item_whiff', { slot: 'A', itemId: 'rivet_gun', reason: 'blocked' })],
      emptyAnimationState(), mockState(), vi.fn(), onHud,
    );
    expect(onHud).toHaveBeenCalledWith({ type: 'itemWhiff' });
  });

  it('item_activate + item_hit → produces projectile (ranged)', () => {
    const animState = emptyAnimationState();
    scheduler.run(
      [
        ev('item_activate', { slot: 'A', itemId: 'rivet_gun', dir: 'E' }),
        ev('item_hit', { entityId: 'e1', amount: 5, x: 4, y: 2 }),
      ],
      animState, mockState(), vi.fn(), vi.fn(),
    );
    expect(animState.projectiles).toHaveLength(1);
    expect(animState.entityPositions.some(p => p.kind === 'lunge')).toBe(false);
  });

  it('item_activate alone → produces player lunge (melee)', () => {
    const animState = emptyAnimationState();
    scheduler.run(
      [ev('item_activate', { slot: 'A', itemId: 'hammer', dir: 'N' })],
      animState, mockState(), vi.fn(), vi.fn(),
    );
    expect(animState.entityPositions.some(p => p.kind === 'lunge')).toBe(true);
    expect(animState.projectiles).toHaveLength(0);
  });

  it('item_hit with non-empty entityId flashes entity, not tile', () => {
    const animState = emptyAnimationState();
    scheduler.run(
      [ev('item_hit', { entityId: 'e1', amount: 5, x: 3, y: 2 })],
      animState, mockState(), vi.fn(), vi.fn(),
    );
    expect(animState.entityFlashes.some(f => f.entityId === 'e1')).toBe(true);
    expect(animState.tileFlashes).toHaveLength(0);
  });

  it('item_hit with empty entityId flashes tile at (x,y)', () => {
    const animState = emptyAnimationState();
    scheduler.run(
      [ev('item_hit', { entityId: '', amount: 5, x: 3, y: 2 })],
      animState, mockState(), vi.fn(), vi.fn(),
    );
    expect(animState.tileFlashes.some(t => t.key === '3,2')).toBe(true);
    expect(animState.entityFlashes).toHaveLength(0);
  });

  it('attack produces lunge on attacker and flash on target', () => {
    const animState = emptyAnimationState();
    scheduler.run(
      [ev('attack', { attackerId: 'player', targetId: 'e1', damage: 3 })],
      animState,
      mockState({ enemyPos: { id: 'e1', pos: { x: 3, y: 2 } } }),
      vi.fn(), vi.fn(),
    );
    expect(animState.entityPositions.some(p => p.entityId === 'player' && p.kind === 'lunge')).toBe(true);
    expect(animState.entityFlashes.some(f => f.entityId === 'e1')).toBe(true);
  });

  it('death produces collapse scale anim on the dying entity', () => {
    const animState = emptyAnimationState();
    scheduler.run(
      [ev('death', { entityId: 'e1' })],
      animState, mockState(), vi.fn(), vi.fn(),
    );
    expect(animState.entityScales.some(s => s.entityId === 'e1' && s.kind === 'collapse')).toBe(true);
  });

  it('explosion produces a burst anim', () => {
    const animState = emptyAnimationState();
    scheduler.run(
      [ev('explosion', { x: 3, y: 3, radius: 2 })],
      animState, mockState(), vi.fn(), vi.fn(),
    );
    expect(animState.bursts).toHaveLength(1);
    expect(animState.bursts[0].x).toBe(3);
    expect(animState.bursts[0].y).toBe(3);
  });
});
