import type { BetEntry, BetPool } from './types.js';

export function buildPool(entries: BetEntry[]): BetPool {
  const byOption: Record<string, number> = {};
  let totalPot = 0;
  for (const entry of entries) {
    byOption[entry.optionId] = (byOption[entry.optionId] ?? 0) + entry.amount;
    totalPot += entry.amount;
  }
  return { totalPot, byOption };
}
