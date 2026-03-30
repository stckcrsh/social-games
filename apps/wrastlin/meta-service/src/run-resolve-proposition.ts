import { loadBettingState, loadPropositions, savePropositions, loadEntries, bettingLogPath } from './betting/persistence.js';
import { computePayouts } from './betting/payouts.js';
import { BettingRunLog } from './betting/runLog.js';

const args = process.argv.slice(2);
const idIdx = args.indexOf('--id');
const optIdx = args.indexOf('--winning-option');

if (idIdx === -1 || optIdx === -1) {
  console.error('Usage: run-resolve-proposition --id <propositionId> --winning-option <optionId>');
  process.exit(1);
}

const propositionId = args[idIdx + 1];
const winningOptionId = args[optIdx + 1];

try {
  const bettingState = loadBettingState();
  if (bettingState?.phase !== 'closed') throw new Error('Betting phase must be closed');

  const propositions = loadPropositions(bettingState.week);
  const proposition = propositions.find(p => p.propositionId === propositionId);
  if (!proposition) throw new Error(`Proposition not found: ${propositionId}`);

  const option = proposition.options.find(o => o.optionId === winningOptionId);
  if (!option) throw new Error(`Option not found: ${winningOptionId}`);

  savePropositions(
    bettingState.week,
    propositions.map(p =>
      p.propositionId === propositionId
        ? {
            ...p,
            judgement: { winningOptionIds: [winningOptionId], rationale: 'Manually resolved by admin', confidence: 'clear' as const },
            resolvedAt: new Date().toISOString(),
          }
        : p,
    ),
  );

  const entries = loadEntries(bettingState.week);
  const payouts = computePayouts(
    entries.filter(e => e.propositionId === propositionId),
    [winningOptionId],
  );

  const log = new BettingRunLog(bettingLogPath(bettingState.week));
  if (log.isJudged(propositionId)) throw new Error(`Proposition already judged: ${propositionId}`);
  log.append({ type: 'judgement_completed', runId: log.runId, propositionId, winningOptionIds: [winningOptionId], rationale: 'Manually resolved by admin', confidence: 'clear', timestamp: new Date().toISOString() });
  log.append({ type: 'payout_calculated', runId: log.runId, propositionId, payouts, timestamp: new Date().toISOString() });

  console.log(`Resolved ${propositionId}: winning option "${option.label}". ${payouts.length} payout(s) queued.`);
} catch (err) {
  console.error('Error:', err instanceof Error ? err.message : String(err));
  process.exit(1);
}
