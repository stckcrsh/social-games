import { loadState, saveState } from './gameState.js';
import type { WeeklyState, WeekPhase } from '@org/wrastlin-shared';

export function getState(): WeeklyState {
  return loadState();
}

export function transitionTo(phase: WeekPhase): WeeklyState {
  const state = loadState();
  const validTransitions: Record<WeekPhase, WeekPhase[]> = {
    week_open: ['submissions_closed'],
    submissions_closed: ['show_generated'],
    show_generated: ['week_open'],
  };

  if (!validTransitions[state.phase].includes(phase)) {
    throw new Error(`Invalid transition: ${state.phase} → ${phase}`);
  }

  const next: WeeklyState = {
    currentWeek: phase === 'week_open' ? state.currentWeek + 1 : state.currentWeek,
    phase,
    updatedAt: new Date().toISOString(),
  };

  saveState(next);
  return next;
}
