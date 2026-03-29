export interface BetOption {
  optionId: string;
  label: string;
}

export interface BetProposition {
  propositionId: string;
  week: number;
  createdBy: string; // managerId
  statement: string;
  options: BetOption[];
  createdAt: string;
  judgement?: {
    winningOptionIds: string[];
    rationale: string;
    confidence: 'clear' | 'ambiguous';
  };
  resolvedAt?: string;
}

export interface BetEntry {
  entryId: string;
  propositionId: string;
  bettorId: string; // managerId
  optionId: string;
  amount: number;
  placedAt: string;
}

export type BettingPhase = 'open' | 'closed' | 'settled';

export interface BettingState {
  week: number;
  phase: BettingPhase;
  openedAt: string;
  closedAt?: string;
  settledAt?: string;
}
