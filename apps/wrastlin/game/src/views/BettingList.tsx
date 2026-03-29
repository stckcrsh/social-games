import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../api/client.js';
import type { BetProposition } from '@org/wrastlin-shared';

export function BettingList() {
  const [propositions, setPropositions] = useState<BetProposition[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    api.getPropositions()
      .then(setPropositions)
      .catch((e: Error) => setError(e.message));
  }, []);

  if (error) return <p style={{ color: 'red' }}>Error: {error}</p>;
  if (!propositions) return <p>Loading...</p>;

  return (
    <div style={{ padding: '1rem' }}>
      <h2>Betting</h2>
      <button onClick={() => navigate('/bets/new')} style={{ marginBottom: '1rem' }}>
        Create Proposition
      </button>
      <ul style={{ listStyle: 'none', padding: 0 }}>
        {propositions.map(p => (
          <li
            key={p.propositionId}
            style={{ marginBottom: '0.5rem', borderBottom: '1px solid #eee', paddingBottom: '0.5rem' }}
          >
            <Link to={`/bets/${p.propositionId}`}>{p.statement}</Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
