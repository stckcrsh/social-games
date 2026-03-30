import type { BetEntry } from '@org/wrastlin-shared';

export interface PendingPayout {
  bettorId: string;
  entryId: string;
  amount: number;
}

export function computePayouts(
  entries: BetEntry[],
  winningOptionIds: string[],
): PendingPayout[] {
  const totalPool = entries.reduce((sum, e) => sum + e.amount, 0);
  const winningEntries = entries.filter(e => winningOptionIds.includes(e.optionId));

  if (winningEntries.length === 0) return [];

  const totalStakedOnWinners = winningEntries.reduce((sum, e) => sum + e.amount, 0);

  return winningEntries.map(e => ({
    bettorId: e.bettorId,
    entryId: e.entryId,
    amount: (e.amount / totalStakedOnWinners) * totalPool,
  }));
}
