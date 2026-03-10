import { loadManagers } from '../core/gameState.js';
import type { Manager } from '@org/wrastlin-shared';

export function getManager(id: string): Manager | undefined {
  return loadManagers().find(m => m.managerId === id);
}

export function getManagerByWrestler(wrestlerId: string): Manager | undefined {
  return loadManagers().find(m => m.wrestlerId === wrestlerId);
}
