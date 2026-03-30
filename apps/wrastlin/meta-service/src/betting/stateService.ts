import { readDynamicJson } from '../data/persistence.js';
import { loadBettingState, saveBettingState } from './persistence.js';
import type { WeeklyState } from '@org/wrastlin-shared';

export function openBetting(): void {
  const weeklyState = readDynamicJson<WeeklyState>('state.json');
  if (weeklyState.phase !== 'show_generated') {
    throw new Error(
      `Cannot open betting: weekly phase must be show_generated, got ${weeklyState.phase}`,
    );
  }

  const existing = loadBettingState();
  if (existing !== null && existing.phase === 'open') {
    throw new Error(`Cannot open betting: already open for week ${existing.week}`);
  }
  if (existing !== null && existing.phase === 'closed') {
    throw new Error(`Cannot open betting: already closed for week ${existing.week}`);
  }

  saveBettingState({
    week: weeklyState.currentWeek,
    phase: 'open',
    openedAt: new Date().toISOString(),
  });

  console.log(`Betting opened for week ${weeklyState.currentWeek}`);
}

export function closeBetting(): void {
  const state = loadBettingState();
  if (state === null || state.phase !== 'open') {
    throw new Error('Cannot close betting: not open');
  }

  saveBettingState({ ...state, phase: 'closed', closedAt: new Date().toISOString() });
  console.log(`Betting closed for week ${state.week}`);
}
