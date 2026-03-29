import type { BetEntry } from '@org/wrastlin-shared';

export interface PoolBreakdown {
  byOption: Record<string, number>;
  total: number;
}

export function computePool(entries: BetEntry[], propositionId: string): PoolBreakdown {
  const relevant = entries.filter(e => e.propositionId === propositionId);
  const byOption: Record<string, number> = {};
  for (const e of relevant) {
    byOption[e.optionId] = (byOption[e.optionId] ?? 0) + e.amount;
  }
  return { byOption, total: relevant.reduce((sum, e) => sum + e.amount, 0) };
}
