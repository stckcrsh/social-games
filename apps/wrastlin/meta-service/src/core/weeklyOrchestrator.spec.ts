import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as gameState from './gameState.js';
import { transitionTo } from './weeklyOrchestrator.js';
import type { WeeklyState } from '@org/wrastlin-shared';

const baseState: WeeklyState = {
  currentWeek: 1,
  phase: 'week_open',
  updatedAt: '2026-01-01T00:00:00Z',
};

beforeEach(() => {
  vi.spyOn(gameState, 'loadState').mockReturnValue({ ...baseState });
  vi.spyOn(gameState, 'saveState').mockImplementation(() => {});
});

describe('transitionTo', () => {
  it('transitions week_open → submissions_closed', () => {
    const next = transitionTo('submissions_closed');
    expect(next.phase).toBe('submissions_closed');
    expect(next.currentWeek).toBe(1);
  });

  it('increments week when transitioning back to week_open', () => {
    vi.spyOn(gameState, 'loadState').mockReturnValue({ ...baseState, phase: 'show_generated' });
    const next = transitionTo('week_open');
    expect(next.currentWeek).toBe(2);
  });

  it('throws on invalid transition', () => {
    expect(() => transitionTo('show_generated')).toThrow('Invalid transition');
  });
});
