import { describe, it, expect } from 'vitest';
import { buildPool } from './pool.js';
import type { BetEntry } from './types.js';

const entry = (optionId: string, amount: number, entryId = 'e-' + optionId): BetEntry => ({
  entryId,
  propositionId: 'p-001',
  bettorId: 'm-001',
  optionId,
  amount,
  placedAt: '2026-01-01T00:00:00Z',
});

describe('buildPool', () => {
  it('returns empty pool when given no entries', () => {
    const pool = buildPool([]);
    expect(pool.totalPot).toBe(0);
    expect(pool.byOption).toEqual({});
  });

  it('totals a single entry', () => {
    const pool = buildPool([entry('opt-a', 100)]);
    expect(pool.totalPot).toBe(100);
    expect(pool.byOption['opt-a']).toBe(100);
  });

  it('sums multiple entries across multiple options', () => {
    const pool = buildPool([
      entry('opt-a', 100, 'e-1'),
      entry('opt-b', 200, 'e-2'),
      entry('opt-a', 50, 'e-3'),
    ]);
    expect(pool.totalPot).toBe(350);
    expect(pool.byOption['opt-a']).toBe(150);
    expect(pool.byOption['opt-b']).toBe(200);
  });
});
