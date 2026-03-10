import { describe, it, expect } from 'vitest';
import { calculatePayouts, parimutuelStrategy } from './payouts.js';
import type { BetEntry, BetPool, PayoutStrategy } from './types.js';

const entry = (
  entryId: string,
  bettorId: string,
  optionId: string,
  amount: number
): BetEntry => ({
  entryId,
  propositionId: 'p-001',
  bettorId,
  optionId,
  amount,
  placedAt: '2026-01-01T00:00:00Z',
});

describe('calculatePayouts (parimutuel default)', () => {
  it('awards the full pot to the single winner', () => {
    const entries: BetEntry[] = [
      entry('e-1', 'm-1', 'opt-a', 100),
      entry('e-2', 'm-2', 'opt-b', 200),
    ];
    const pool: BetPool = { totalPot: 300, byOption: { 'opt-a': 100, 'opt-b': 200 } };

    const payouts = calculatePayouts(pool, entries, ['opt-a']);

    expect(payouts).toHaveLength(1);
    expect(payouts[0].bettorId).toBe('m-1');
    expect(payouts[0].entryId).toBe('e-1');
    expect(payouts[0].amount).toBe(300); // full pot goes to the only winner
  });

  it('splits the pot proportionally among multiple winners on the same option', () => {
    // Two bettors both picked opt-a (100 and 100), nobody picked opt-b (200)
    const entries: BetEntry[] = [
      entry('e-1', 'm-1', 'opt-a', 100),
      entry('e-2', 'm-2', 'opt-a', 100),
      entry('e-3', 'm-3', 'opt-b', 200),
    ];
    const pool: BetPool = { totalPot: 400, byOption: { 'opt-a': 200, 'opt-b': 200 } };

    const payouts = calculatePayouts(pool, entries, ['opt-a']);

    expect(payouts).toHaveLength(2);
    // Each winner staked 100 out of 200 total on opt-a → 50% × 400 = 200 each
    const sorted = payouts.sort((a, b) => a.bettorId.localeCompare(b.bettorId));
    expect(sorted[0].amount).toBe(200);
    expect(sorted[1].amount).toBe(200);
  });

  it('splits the pot proportionally when multiple options are all declared winners', () => {
    // opt-a bettor staked 100, opt-b bettor staked 300 — both win
    const entries: BetEntry[] = [
      entry('e-1', 'm-1', 'opt-a', 100),
      entry('e-2', 'm-2', 'opt-b', 300),
    ];
    const pool: BetPool = { totalPot: 400, byOption: { 'opt-a': 100, 'opt-b': 300 } };

    const payouts = calculatePayouts(pool, entries, ['opt-a', 'opt-b']);

    expect(payouts).toHaveLength(2);
    const byBettor = Object.fromEntries(payouts.map(p => [p.bettorId, p.amount]));
    // m-1: 100/400 × 400 = 100; m-2: 300/400 × 400 = 300
    expect(byBettor['m-1']).toBe(100);
    expect(byBettor['m-2']).toBe(300);
  });

  it('returns empty array when no entries match winning options', () => {
    const entries: BetEntry[] = [entry('e-1', 'm-1', 'opt-b', 100)];
    const pool: BetPool = { totalPot: 100, byOption: { 'opt-b': 100 } };

    const payouts = calculatePayouts(pool, entries, ['opt-a']);

    expect(payouts).toHaveLength(0);
  });

  it('uses a custom strategy when provided', () => {
    const flatStrategy: PayoutStrategy = {
      calculate: (_pool, entries, winningOptionIds) =>
        entries
          .filter(e => winningOptionIds.includes(e.optionId))
          .map(e => ({ bettorId: e.bettorId, entryId: e.entryId, amount: e.amount * 2 })),
    };

    const entries: BetEntry[] = [entry('e-1', 'm-1', 'opt-a', 50)];
    const pool: BetPool = { totalPot: 50, byOption: { 'opt-a': 50 } };

    const payouts = calculatePayouts(pool, entries, ['opt-a'], flatStrategy);

    expect(payouts[0].amount).toBe(100); // doubled by custom strategy
  });
});
