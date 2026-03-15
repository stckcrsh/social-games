import { describe, it, expect } from 'vitest';
import type { Wrestler } from '@org/wrastlin-shared';
import { computeRivalryHeat } from './dataBuilders.js';

// Minimal fixture helper — only fields relevant to rivalry heat
function makeWrestler(id: string, relationships: Wrestler['relationships'] = []): Wrestler {
  return {
    wrestlerId: id,
    name: `Wrestler ${id}`,
    gimmick: 'Test Gimmick',
    stats: { strength: 70, agility: 70, endurance: 70, charisma: 70 },
    personality: { ego: 5, anger: 5, honor: 5, loyalty: 5, ambition: 5 },
    emotionalState: { confidence: 5, frustration: 5, fatigue: 5 },
    relationships,
    memories: [],
    managerTrust: 5,
  };
}

describe('computeRivalryHeat', () => {
  it('returns 0 when neither wrestler has a relationship', () => {
    const wrestlers = [makeWrestler('w-001'), makeWrestler('w-002')];
    expect(computeRivalryHeat(wrestlers, 'w-001', 'w-002')).toBe(0);
  });

  it('returns the average of mutual hatred rounded to nearest integer', () => {
    const wrestlers = [
      makeWrestler('w-001', [{ wrestlerId: 'w-002', hatred: 8, respect: 2, trust: 1 }]),
      makeWrestler('w-002', [{ wrestlerId: 'w-001', hatred: 6, respect: 3, trust: 2 }]),
    ];
    expect(computeRivalryHeat(wrestlers, 'w-001', 'w-002')).toBe(7); // (8+6)/2 = 7
  });

  it('returns half of one-sided hatred when the other side has no relationship entry', () => {
    const wrestlers = [
      makeWrestler('w-001', [{ wrestlerId: 'w-002', hatred: 8, respect: 2, trust: 1 }]),
      makeWrestler('w-002', []),
    ];
    expect(computeRivalryHeat(wrestlers, 'w-001', 'w-002')).toBe(4); // (8+0)/2 = 4
  });

  it('rounds 0.5 up', () => {
    const wrestlers = [
      makeWrestler('w-001', [{ wrestlerId: 'w-002', hatred: 7, respect: 2, trust: 1 }]),
      makeWrestler('w-002', [{ wrestlerId: 'w-001', hatred: 8, respect: 3, trust: 2 }]),
    ];
    expect(computeRivalryHeat(wrestlers, 'w-001', 'w-002')).toBe(8); // (7+8)/2 = 7.5 → 8
  });
});
