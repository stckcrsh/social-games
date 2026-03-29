import fs from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';

export type BettingLogEntry =
  | { type: 'judge_started';       runId: string; week: number; timestamp: string }
  | { type: 'judgement_completed'; runId: string; propositionId: string; winningOptionIds: string[]; rationale: string; confidence: 'clear' | 'ambiguous'; timestamp: string }
  | { type: 'judgement_flagged';   runId: string; propositionId: string; reason: string; timestamp: string }
  | { type: 'payout_calculated';   runId: string; propositionId: string; payouts: { bettorId: string; entryId: string; amount: number }[]; timestamp: string }
  | { type: 'payout_applied';      runId: string; bettorId: string; entryId: string; amount: number; timestamp: string }
  | { type: 'run_completed';       runId: string; week: number; totalPaid: number; timestamp: string };

export class BettingRunLog {
  readonly runId: string;
  private readonly filePath: string;
  private readonly judgedPropositions = new Set<string>();
  private readonly appliedEntries = new Set<string>();

  constructor(filePath: string) {
    this.filePath = filePath;
    this.runId = randomUUID();

    if (fs.existsSync(filePath)) {
      const lines = fs.readFileSync(filePath, 'utf-8').split('\n').filter(Boolean);
      for (const line of lines) {
        const entry = JSON.parse(line) as BettingLogEntry;
        if (entry.type === 'judgement_completed' || entry.type === 'judgement_flagged') {
          this.judgedPropositions.add(entry.propositionId);
        }
        if (entry.type === 'payout_applied') {
          this.appliedEntries.add(entry.entryId);
        }
      }
    }
  }

  append(entry: BettingLogEntry): void {
    fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
    fs.appendFileSync(this.filePath, JSON.stringify(entry) + '\n', 'utf-8');
  }

  isJudged(propositionId: string): boolean {
    return this.judgedPropositions.has(propositionId);
  }

  isPayoutApplied(entryId: string): boolean {
    return this.appliedEntries.has(entryId);
  }

  readAllEvents(): BettingLogEntry[] {
    if (!fs.existsSync(this.filePath)) return [];
    return fs.readFileSync(this.filePath, 'utf-8')
      .split('\n')
      .filter(Boolean)
      .map(line => JSON.parse(line) as BettingLogEntry);
  }
}
