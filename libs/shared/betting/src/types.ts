export type PropositionStatus = 'open' | 'closed' | 'resolved';

export interface BetOption {
  optionId: string;
  label: string;
}

export interface BetProposition {
  propositionId: string;
  createdBy: string;
  question: string;
  options: BetOption[];
  status: PropositionStatus;
  closesAt: string;         // ISO — hard per-proposition deadline
  eventKey: string | number; // week number or game-specific event identifier
  createdAt: string;
  resolvedAt?: string;
  winningOptionIds?: string[];
}

export interface BetEntry {
  entryId: string;
  propositionId: string;
  bettorId: string;
  optionId: string;
  amount: number;
  placedAt: string;
}

export interface BetPool {
  totalPot: number;
  byOption: Record<string, number>; // optionId → total wagered on that option
}

/**
 * amount = total to credit the winner (includes their original stake).
 * Do NOT additionally refund the stake — the full parimutuel share is here.
 */
export interface BetPayout {
  bettorId: string;
  entryId: string;
  amount: number;
}

export interface PayoutStrategy {
  calculate(pool: BetPool, entries: BetEntry[], winningOptionIds: string[]): BetPayout[];
}
