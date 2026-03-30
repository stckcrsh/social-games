import { readDynamicJson } from '../data/persistence.js';
import {
  loadBettingState,
  loadPropositions,
  savePropositions,
  loadEntries,
  bettingLogPath,
} from './persistence.js';
import { judgeProposition } from './judgeAgent.js';
import { computePayouts } from './payouts.js';
import { BettingRunLog } from './runLog.js';
import type { Show, WeeklyState } from '@org/wrastlin-shared';

export async function runJudge(): Promise<void> {
  const bettingState = loadBettingState();
  if (bettingState?.phase !== 'closed') {
    throw new Error(
      `Cannot run judge: betting phase must be closed, got ${bettingState?.phase ?? 'none'}`,
    );
  }

  const weeklyState = readDynamicJson<WeeklyState>('state.json');
  if (weeklyState.phase !== 'show_generated') {
    throw new Error(
      `Cannot run judge: weekly phase must be show_generated, got ${weeklyState.phase}`,
    );
  }

  const show = readDynamicJson<Show>(`shows/week-${bettingState.week}.json`);
  const propositions = loadPropositions(bettingState.week);
  const entries = loadEntries(bettingState.week);

  const log = new BettingRunLog(bettingLogPath(bettingState.week));
  log.append({
    type: 'judge_started',
    runId: log.runId,
    week: bettingState.week,
    timestamp: new Date().toISOString(),
  });

  const unresolved = propositions.filter(p => !log.isJudged(p.propositionId));

  const results = await Promise.allSettled(
    unresolved.map(async proposition => {
      const judgement = await judgeProposition(proposition, show);

      if (judgement.confidence === 'ambiguous') {
        log.append({
          type: 'judgement_flagged',
          runId: log.runId,
          propositionId: proposition.propositionId,
          reason: 'Judge returned ambiguous confidence',
          timestamp: new Date().toISOString(),
        });
        return { proposition, judgement, flagged: true };
      }

      log.append({
        type: 'judgement_completed',
        runId: log.runId,
        propositionId: proposition.propositionId,
        winningOptionIds: judgement.winningOptionIds,
        rationale: judgement.rationale,
        confidence: judgement.confidence,
        timestamp: new Date().toISOString(),
      });

      const propEntries = entries.filter(e => e.propositionId === proposition.propositionId);
      const payouts = computePayouts(propEntries, judgement.winningOptionIds);
      log.append({
        type: 'payout_calculated',
        runId: log.runId,
        propositionId: proposition.propositionId,
        payouts,
        timestamp: new Date().toISOString(),
      });

      return { proposition, judgement, flagged: false };
    }),
  );

  // Write judgements back to propositions.json
  const updatedPropositions = propositions.map(p => {
    const match = results.find(
      r => r.status === 'fulfilled' && r.value.proposition.propositionId === p.propositionId,
    );
    if (match?.status === 'fulfilled') {
      const { judgement, flagged } = match.value;
      return {
        ...p,
        judgement: {
          winningOptionIds: judgement.winningOptionIds,
          rationale: judgement.rationale,
          confidence: judgement.confidence,
        },
        resolvedAt: flagged ? undefined : new Date().toISOString(),
      };
    }
    return p;
  });
  savePropositions(bettingState.week, updatedPropositions);

  const flagged = results.filter(r => r.status === 'fulfilled' && r.value.flagged).length;
  const failed = results.filter(r => r.status === 'rejected').length;
  const resolved = results.length - flagged - failed;

  console.log(`Judge complete: ${resolved} resolved, ${flagged} need manual review, ${failed} failed`);
  if (flagged > 0) {
    const ids = updatedPropositions
      .filter(p => p.judgement?.confidence === 'ambiguous' && !p.resolvedAt)
      .map(p => p.propositionId)
      .join(', ');
    console.log(`Flagged: ${ids}`);
    console.log('Use: pnpm nx run wrastlin-service:resolve-proposition -- --id <id> --winning-option <optionId>');
  }
}
