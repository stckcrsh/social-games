import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as persistence from './persistence.js';
import * as gamePersistence from '../data/persistence.js';
import { openBetting, closeBetting } from './stateService.js';
import type { WeeklyState } from '@org/wrastlin-shared';

const mockWeeklyState: WeeklyState = {
  currentWeek: 7,
  phase: 'show_generated',
  updatedAt: '2026-03-28T10:00:00.000Z',
};

beforeEach(() => {
  vi.restoreAllMocks();
});

describe('openBetting', () => {
  it('creates betting state in open phase for current week', () => {
    vi.spyOn(gamePersistence, 'readDynamicJson').mockReturnValue(mockWeeklyState);
    vi.spyOn(persistence, 'loadBettingState').mockReturnValue(null);
    const saved = vi.spyOn(persistence, 'saveBettingState').mockImplementation(() => {});

    openBetting();

    expect(saved).toHaveBeenCalledWith(
      expect.objectContaining({ week: 7, phase: 'open' }),
    );
  });

  it('throws if weekly phase is not show_generated', () => {
    vi.spyOn(gamePersistence, 'readDynamicJson').mockReturnValue({
      ...mockWeeklyState, phase: 'week_open',
    });
    vi.spyOn(persistence, 'loadBettingState').mockReturnValue(null);

    expect(() => openBetting()).toThrow('show_generated');
  });

  it('throws if betting is already open', () => {
    vi.spyOn(gamePersistence, 'readDynamicJson').mockReturnValue(mockWeeklyState);
    vi.spyOn(persistence, 'loadBettingState').mockReturnValue({
      week: 7, phase: 'open', openedAt: '2026-03-28T10:00:00.000Z',
    });

    expect(() => openBetting()).toThrow('already open');
  });

  it('throws if betting is already closed', () => {
    vi.spyOn(gamePersistence, 'readDynamicJson').mockReturnValue(mockWeeklyState);
    vi.spyOn(persistence, 'loadBettingState').mockReturnValue({
      week: 7, phase: 'closed', openedAt: '2026-03-28T10:00:00.000Z', closedAt: '2026-03-28T11:00:00.000Z',
    });

    expect(() => openBetting()).toThrow('already closed');
  });
});

describe('closeBetting', () => {
  it('transitions open → closed', () => {
    vi.spyOn(persistence, 'loadBettingState').mockReturnValue({
      week: 7, phase: 'open', openedAt: '2026-03-28T10:00:00.000Z',
    });
    const saved = vi.spyOn(persistence, 'saveBettingState').mockImplementation(() => {});

    closeBetting();

    expect(saved).toHaveBeenCalledWith(
      expect.objectContaining({ phase: 'closed' }),
    );
  });

  it('throws if betting is not open', () => {
    vi.spyOn(persistence, 'loadBettingState').mockReturnValue(null);

    expect(() => closeBetting()).toThrow('not open');
  });
});
