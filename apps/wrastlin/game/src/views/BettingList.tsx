import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../api/client.js';
import { computePool } from '../utils/pool.js';
import { BettingResults } from './BettingResults.js';
import type { BetProposition, BetEntry, BettingState, Manager } from '@org/wrastlin-shared';

export function BettingList() {
  const [manager, setManager] = useState<Manager | null>(null);
  const [state, setState] = useState<BettingState | null | undefined>(undefined);
  const [propositions, setPropositions] = useState<BetProposition[]>([]);
  const [allEntries, setAllEntries] = useState<BetEntry[]>([]);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    Promise.all([api.getMe(), api.getBettingState()])
      .then(async ([{ manager: m }, s]) => {
        setManager(m);
        setState(s);
        if (s !== null) {
          const [props, entries] = await Promise.all([
            api.getPropositions(),
            api.getAllEntries(),
          ]);
          setPropositions(props);
          setAllEntries(entries);
        }
      })
      .catch((e: Error) => setError(e.message));
  }, []);

  if (error) return <p style={{ color: 'red' }}>Error: {error}</p>;
  if (state === undefined || !manager) return <p>Loading...</p>;
  if (state === null) return <p>No active betting window</p>;

  if (state.phase === 'settled') {
    return (
      <BettingResults
        state={state}
        propositions={propositions}
        allEntries={allEntries}
        managerId={manager.managerId}
      />
    );
  }

  return (
    <div style={{ padding: '1rem' }}>
      <h2>Betting — Week {state.week}</h2>
      {state.phase === 'open' && (
        <button onClick={() => navigate('/bets/new')} style={{ marginBottom: '1rem' }}>
          Create Proposition
        </button>
      )}
      {state.phase === 'closed' && (
        <p style={{ color: 'gray', marginBottom: '1rem' }}>Betting closed — awaiting results</p>
      )}
      <ul style={{ listStyle: 'none', padding: 0 }}>
        {propositions.map(p => {
          const pool = computePool(allEntries, p.propositionId);
          return (
            <li key={p.propositionId} style={{ marginBottom: '1rem', borderBottom: '1px solid #eee', paddingBottom: '0.5rem' }}>
              <Link to={`/bets/${p.propositionId}`}>{p.statement}</Link>
              <span style={{ marginLeft: '0.5rem', color: 'gray' }}>Pool: ${pool.total}</span>
              <ul style={{ margin: '0.25rem 0 0 1rem', listStyle: 'none', padding: 0 }}>
                {p.options.map(opt => (
                  <li key={opt.optionId} style={{ fontSize: '0.875rem', color: 'gray' }}>
                    {opt.label}: ${pool.byOption[opt.optionId] ?? 0}
                  </li>
                ))}
              </ul>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
