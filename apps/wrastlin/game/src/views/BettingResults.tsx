import type { BetProposition, BetEntry, BettingState } from '@org/wrastlin-shared';
import { computePool } from '../utils/pool.js';

interface BettingResultsProps {
  state: BettingState;
  propositions: BetProposition[];
  allEntries: BetEntry[];
  managerId: string;
}

function computePayout(proposition: BetProposition, entry: BetEntry, allEntries: BetEntry[]): number {
  if (!proposition.judgement) return 0;
  const { winningOptionIds } = proposition.judgement;
  if (!winningOptionIds.includes(entry.optionId)) return 0;
  const { byOption, total } = computePool(allEntries, proposition.propositionId);
  const totalOnWinner = winningOptionIds.reduce((sum, id) => sum + (byOption[id] ?? 0), 0);
  if (totalOnWinner === 0) return 0;
  return (entry.amount / totalOnWinner) * total;
}

export function BettingResults({ state, propositions, allEntries, managerId }: BettingResultsProps) {
  const myEntries = allEntries.filter(e => e.bettorId === managerId);

  const myBetResults = myEntries.flatMap(entry => {
    const proposition = propositions.find(p => p.propositionId === entry.propositionId);
    if (!proposition) return [];
    const option = proposition.options.find(o => o.optionId === entry.optionId);
    const payout = proposition.judgement ? computePayout(proposition, entry, allEntries) : null;
    const won = payout !== null && payout > 0;
    return [{ entry, proposition, option, payout, won, isResolved: !!proposition.judgement }];
  });

  const resolvedBets = myBetResults.filter(r => r.isResolved);
  const wins = resolvedBets.filter(r => r.won).length;
  const losses = resolvedBets.filter(r => !r.won).length;
  const netPL = resolvedBets.reduce((sum, r) =>
    sum + (r.won ? (r.payout! - r.entry.amount) : -r.entry.amount), 0);

  return (
    <div style={{ padding: '1rem' }}>
      <h2>My Results — Week {state.week}</h2>
      <p>
        Net:{' '}
        <strong style={{ color: netPL >= 0 ? 'green' : 'red' }}>
          {netPL >= 0 ? '+' : '-'}${Math.abs(netPL).toFixed(0)}
        </strong>
        {' '}· {wins} win{wins !== 1 ? 's' : ''}, {losses} loss{losses !== 1 ? 'es' : ''}
      </p>

      {myBetResults.length > 0 && (
        <ul style={{ listStyle: 'none', padding: 0, marginBottom: '2rem' }}>
          {myBetResults.map(({ entry, option, payout, won, isResolved }) => (
            <li key={entry.entryId} style={{ marginBottom: '0.25rem' }}>
              Bet ${entry.amount} on {option?.label ?? entry.optionId}
              {isResolved && payout !== null
                ? won
                  ? ` → won $${Math.round(payout)}`
                  : ` → lost $${entry.amount}`
                : ' → awaiting result'}
            </li>
          ))}
        </ul>
      )}

      <h3>All Propositions</h3>
      <ul style={{ listStyle: 'none', padding: 0 }}>
        {propositions.map(p => {
          const pool = computePool(allEntries, p.propositionId);
          const isAmbiguousPending = p.judgement?.confidence === 'ambiguous' && !p.resolvedAt;
          return (
            <li key={p.propositionId} style={{ marginBottom: '1rem', borderBottom: '1px solid #eee', paddingBottom: '1rem' }}>
              <strong>{p.statement}</strong>
              {isAmbiguousPending && (
                <span style={{ marginLeft: '0.5rem', color: 'orange' }}>⚠ Awaiting manual review</span>
              )}
              <ul style={{ margin: '0.25rem 0 0.25rem 1rem' }}>
                {p.options.map(opt => {
                  const isWinner = p.judgement?.winningOptionIds.includes(opt.optionId);
                  return (
                    <li key={opt.optionId}>
                      {opt.label}{isWinner ? ' (winner)' : ''} — ${pool.byOption[opt.optionId] ?? 0} in pool
                    </li>
                  );
                })}
              </ul>
              {p.judgement && (
                <p style={{ margin: '0.25rem 0', fontStyle: 'italic' }}>{p.judgement.rationale}</p>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
