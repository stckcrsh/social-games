import { useEffect, useState } from 'react';
import { api } from '../api/client.js';
import { WrestlerCard } from '../components/WrestlerCard.js';
import type { Wrestler, Manager } from '@org/wrastlin-shared';

const MANAGER_ID = 'm-001'; // hardcoded for solo MVP

export function WrestlerDashboard() {
  const [wrestler, setWrestler] = useState<Wrestler | null>(null);
  const [manager, setManager] = useState<Manager | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.getManager(MANAGER_ID)
      .then(m => {
        setManager(m);
        return api.getWrestler(m.wrestlerId);
      })
      .then(setWrestler)
      .catch(e => setError(e.message));
  }, []);

  if (error) return <p style={{ color: 'red' }}>Error: {error}</p>;
  if (!wrestler || !manager) return <p>Loading...</p>;

  return (
    <div style={{ padding: '1rem' }}>
      <WrestlerCard wrestler={wrestler} />
    </div>
  );
}
