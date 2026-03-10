import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as gameState from '../core/gameState.js';
import { getWrestler } from './wrestlerState.js';
import type { Wrestler } from '@org/wrastlin-shared';

const mockWrestler: Wrestler = {
  wrestlerId: 'w-test',
  name: 'Test Wrestler',
  gimmick: 'The Tester',
  stats: { strength: 70, agility: 70, endurance: 70, charisma: 70 },
  personality: { ego: 5, anger: 5, honor: 5, loyalty: 5, ambition: 5 },
  emotionalState: { confidence: 5, frustration: 5, fatigue: 5 },
  relationships: [],
  memories: [],
  managerTrust: 5,
};

beforeEach(() => {
  vi.spyOn(gameState, 'loadWrestlers').mockReturnValue([mockWrestler]);
});

describe('getWrestler', () => {
  it('returns wrestler by id', () => {
    const result = getWrestler('w-test');
    expect(result).toEqual(mockWrestler);
  });

  it('returns undefined for unknown id', () => {
    expect(getWrestler('w-unknown')).toBeUndefined();
  });
});
