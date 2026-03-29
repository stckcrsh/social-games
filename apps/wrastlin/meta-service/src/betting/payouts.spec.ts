import { describe, it, expect } from 'vitest';
import { computePayouts } from './payouts.js';
import type { BetEntry } from '@org/wrastlin-shared';

const entries: BetEntry[] = [
  { entryId: 'e-1', propositionId: 'p-1', bettorId: 'm-001', optionId: 'opt-a', amount: 100, placedAt: '' },
  { entryId: 'e-2', propositionId: 'p-1', bettorId: 'm-002', optionId: 'opt-b', amount: 60,  placedAt: '' },
  { entryId: 'e-3', propositionId: 'p-1', bettorId: 'm-003', optionId: 'opt-a', amount: 40,  placedAt: '' },
];

describe('computePayouts', () => {
  it('splits pool proportionally among winners', () => {
    const payouts = computePayouts(entries, ['opt-a']);
    // Pool: 200. Winners staked: 140. m-001 gets 200*(100/140), m-003 gets 200*(40/140)
    expect(payouts).toHaveLength(2);
    const m001 = payouts.find(p => p.bettorId === 'm-001')!;
    const m003 = payouts.find(p => p.bettorId === 'm-003')!;
    expect(m001.amount).toBeCloseTo(142.86, 1);
    expect(m003.amount).toBeCloseTo(57.14, 1);
  });

  it('returns no payouts if no entries exist for winning option (everyone loses)', () => {
    const payouts = computePayouts(entries, ['opt-c']);
    expect(payouts).toHaveLength(0);
  });

  it('returns single winner with full pool', () => {
    const solo: BetEntry[] = [
      { entryId: 'e-1', propositionId: 'p-1', bettorId: 'm-001', optionId: 'opt-a', amount: 100, placedAt: '' },
      { entryId: 'e-2', propositionId: 'p-1', bettorId: 'm-002', optionId: 'opt-b', amount: 50,  placedAt: '' },
    ];
    const payouts = computePayouts(solo, ['opt-a']);
    expect(payouts).toHaveLength(1);
    expect(payouts[0].amount).toBe(150);
  });
});
