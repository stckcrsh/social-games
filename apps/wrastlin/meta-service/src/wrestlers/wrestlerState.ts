import { loadWrestlers, saveWrestlers } from '../core/gameState.js';
import type { Wrestler } from '@org/wrastlin-shared';

export function getWrestler(id: string): Wrestler | undefined {
  return loadWrestlers().find(w => w.wrestlerId === id);
}

export function updateWrestler(updated: Wrestler): void {
  const wrestlers = loadWrestlers().map(w =>
    w.wrestlerId === updated.wrestlerId ? updated : w
  );
  saveWrestlers(wrestlers);
}
