import { readDynamicJson, writeDynamicJson } from '../data/persistence.js';
import {
  loadBettingState,
  saveBettingState,
  loadPropositions,
  bettingLogPath,
} from './persistence.js';
import { BettingRunLog } from './runLog.js';
import type { Manager } from '@org/wrastlin-shared';

export function applyPayouts(): void {
  const bettingState = loadBettingState();
  if (bettingState?.phase !== 'closed') {
    throw new Error('Cannot apply payouts: betting phase must be closed');
  }

  const propositions = loadPropositions(bettingState.week);
  const pendingReview = propositions.filter(
    p => p.judgement?.confidence === 'ambiguous' && !p.resolvedAt,
  );
  if (pendingReview.length > 0) {
    const ids = pendingReview.map(p => p.propositionId).join(', ');
    throw new Error(
      `Cannot apply payouts: ${pendingReview.length} proposition(s) need manual review: ${ids}`,
    );
  }

  const log = new BettingRunLog(bettingLogPath(bettingState.week));
  const allEvents = log.readAllEvents();
  const payoutEvents = allEvents.filter(e => e.type === 'payout_calculated') as Extract<
    (typeof allEvents)[number],
    { type: 'payout_calculated' }
  >[];

  const managers = readDynamicJson<Manager[]>('managers.json');
  let totalPaid = 0;

  for (const event of payoutEvents) {
    for (const payout of event.payouts) {
      if (log.isPayoutApplied(payout.entryId)) continue;

      const manager = managers.find(m => m.managerId === payout.bettorId);
      if (!manager) {
        console.warn(`Manager not found for payout: ${payout.bettorId}, skipping`);
        continue;
      }

      manager.money += payout.amount;
      totalPaid += payout.amount;

      log.append({
        type: 'payout_applied',
        runId: log.runId,
        bettorId: payout.bettorId,
        entryId: payout.entryId,
        amount: payout.amount,
        timestamp: new Date().toISOString(),
      });
    }
  }

  writeDynamicJson('managers.json', managers);
  saveBettingState({ ...bettingState, phase: 'settled', settledAt: new Date().toISOString() });

  log.append({
    type: 'run_completed',
    runId: log.runId,
    week: bettingState.week,
    totalPaid,
    timestamp: new Date().toISOString(),
  });

  console.log(`Payouts applied. Total paid: $${totalPaid.toFixed(2)}. Week ${bettingState.week} settled.`);
}
