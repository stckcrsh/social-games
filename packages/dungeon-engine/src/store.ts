import type { RunState } from './models/types.js';

const runs = new Map<string, RunState>();

export const store = {
  get(id: string): RunState | undefined {
    return runs.get(id);
  },

  set(state: RunState): void {
    runs.set(state.id, state);
  },

  delete(id: string): boolean {
    return runs.delete(id);
  },

  has(id: string): boolean {
    return runs.has(id);
  },
};
