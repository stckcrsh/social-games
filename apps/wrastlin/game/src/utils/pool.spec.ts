import { computePool } from './pool.js';
import type { BetEntry } from '@org/wrastlin-shared';

const entries: BetEntry[] = [
  { entryId: 'e-1', propositionId: 'prop-1', bettorId: 'm-001', optionId: 'opt-1', amount: 50, placedAt: '' },
  { entryId: 'e-2', propositionId: 'prop-1', bettorId: 'm-002', optionId: 'opt-2', amount: 30, placedAt: '' },
  { entryId: 'e-3', propositionId: 'prop-1', bettorId: 'm-003', optionId: 'opt-1', amount: 20, placedAt: '' },
  { entryId: 'e-4', propositionId: 'prop-2', bettorId: 'm-001', optionId: 'opt-1', amount: 100, placedAt: '' },
];

describe('computePool', () => {
  it('sums amounts per option for the given proposition', () => {
    const result = computePool(entries, 'prop-1');
    expect(result.byOption).toEqual({ 'opt-1': 70, 'opt-2': 30 });
  });

  it('returns correct total', () => {
    const result = computePool(entries, 'prop-1');
    expect(result.total).toBe(100);
  });

  it('excludes entries from other propositions', () => {
    const result = computePool(entries, 'prop-2');
    expect(result.total).toBe(100);
    expect(result.byOption).toEqual({ 'opt-1': 100 });
  });

  it('returns zero total and empty byOption when no entries match', () => {
    const result = computePool(entries, 'prop-99');
    expect(result.total).toBe(0);
    expect(result.byOption).toEqual({});
  });
});
