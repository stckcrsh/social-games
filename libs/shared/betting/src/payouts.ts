import type { BetEntry, BetPool, BetPayout, PayoutStrategy } from './types.js';

export const parimutuelStrategy: PayoutStrategy = {
  calculate(pool: BetPool, entries: BetEntry[], winningOptionIds: string[]): BetPayout[] {
    const totalStakedOnWinners = winningOptionIds.reduce(
      (sum, id) => sum + (pool.byOption[id] ?? 0),
      0
    );
    if (totalStakedOnWinners === 0) return [];

    return entries
      .filter(e => winningOptionIds.includes(e.optionId))
      .map(e => ({
        bettorId: e.bettorId,
        entryId: e.entryId,
        amount: (e.amount / totalStakedOnWinners) * pool.totalPot,
      }));
  },
};

export function calculatePayouts(
  pool: BetPool,
  entries: BetEntry[],
  winningOptionIds: string[],
  strategy: PayoutStrategy = parimutuelStrategy
): BetPayout[] {
  return strategy.calculate(pool, entries, winningOptionIds);
}
