import { describe, it, expect } from 'vitest';
import { resolveMatch } from './matchResolver.js';
import type { Wrestler } from '@org/wrastlin-shared';

const makeWrestler = (overrides: Partial<Wrestler> = {}): Wrestler => ({
  wrestlerId: 'w-test-a',
  name: 'Test A',
  gimmick: 'Tester',
  stats: { strength: 70, agility: 70, endurance: 70, charisma: 70 },
  personality: { ego: 5, anger: 5, honor: 5, loyalty: 5, ambition: 5 },
  emotionalState: { confidence: 5, frustration: 5, fatigue: 5 },
  relationships: [],
  memories: [],
  managerTrust: 5,
  ...overrides,
});

describe('resolveMatch', () => {
  it('returns a match result with a winner', () => {
    const a = makeWrestler({ wrestlerId: 'w-a' });
    const b = makeWrestler({ wrestlerId: 'w-b' });
    const result = resolveMatch(a, b);
    expect([a.wrestlerId, b.wrestlerId]).toContain(result.winner);
  });

  it('includes a valid finish type', () => {
    const validFinish = ['clean', 'dirty', 'interference', 'count-out', 'dq', 'no-contest'];
    const a = makeWrestler({ wrestlerId: 'w-a' });
    const b = makeWrestler({ wrestlerId: 'w-b' });
    const result = resolveMatch(a, b);
    expect(validFinish).toContain(result.finishType);
  });

  it('higher-stat wrestler wins more often (probabilistic)', () => {
    const strong = makeWrestler({
      wrestlerId: 'w-strong',
      stats: { strength: 95, agility: 95, endurance: 95, charisma: 95 },
      emotionalState: { confidence: 9, frustration: 1, fatigue: 1 },
    });
    const weak = makeWrestler({
      wrestlerId: 'w-weak',
      stats: { strength: 20, agility: 20, endurance: 20, charisma: 20 },
      emotionalState: { confidence: 2, frustration: 8, fatigue: 8 },
    });

    let strongWins = 0;
    for (let i = 0; i < 100; i++) {
      if (resolveMatch(strong, weak).winner === 'w-strong') strongWins++;
    }
    expect(strongWins).toBeGreaterThan(70);
  });
});
