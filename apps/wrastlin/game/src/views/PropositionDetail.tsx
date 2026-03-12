import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { api, ApiError } from '../api/client.js';
import type { BetProposition, BetPool, BetEntry } from '@org/betting';
import type { Manager } from '@org/wrastlin-shared';

const MANAGER_ID = 'm-001';

export function PropositionDetail() {
  const { id } = useParams<{ id: string }>();
  const [proposition, setProposition] = useState<(BetProposition & { pool: BetPool }) | null>(null);
  const [manager, setManager] = useState<Manager | null>(null);
  const [myEntries, setMyEntries] = useState<BetEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedOption, setSelectedOption] = useState('');
  const [amount, setAmount] = useState(1);
  const [betError, setBetError] = useState('');

  // loadData is defined before useEffect but after all hook declarations
  async function loadData() {
    try {
      const [prop, mgr, allEntries] = await Promise.all([
        api.getProposition(id!),
        api.getManager(MANAGER_ID),
        api.getMyEntries(MANAGER_ID),
      ]);
      setProposition(prop);
      setManager(mgr);
      setMyEntries(allEntries.filter(e => e.propositionId === id));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  // All hooks must be called unconditionally before any early returns (Rules of Hooks)
  useEffect(() => { if (id) loadData(); }, []);

  // Guard after all hooks
  if (!id) return null;

  if (loading) return <p>Loading...</p>;
  if (error) return <p style={{ color: 'red' }}>Error: {error}</p>;
  if (!proposition || !manager) return null;

  async function placeBet() {
    setBetError('');
    try {
      await api.placeBet(id!, { bettorId: MANAGER_ID, optionId: selectedOption, amount });
      // Re-fetch in parallel — no loading state shown
      const [prop, allEntries] = await Promise.all([
        api.getProposition(id!),
        api.getMyEntries(MANAGER_ID),
      ]);
      setProposition(prop);
      setMyEntries(allEntries.filter(e => e.propositionId === id));
    } catch (e) {
      setBetError(e instanceof ApiError ? e.serverMessage : (e as Error).message);
    }
  }

  return (
    <div style={{ padding: '1rem', maxWidth: '600px' }}>
      <h2>{proposition.question}</h2>
      <p>Status: {proposition.status}</p>
      <p>Closes: {new Date(proposition.closesAt).toLocaleDateString('en-US')}</p>

      <h3>Options</h3>
      <ul>
        {proposition.options.map(opt => (
          <li key={opt.optionId}>
            {opt.label} — ${proposition.pool.byOption[opt.optionId] ?? 0} in pool
          </li>
        ))}
      </ul>

      {myEntries.map(entry => {
        const opt = proposition.options.find(o => o.optionId === entry.optionId);
        return (
          <p key={entry.entryId}>
            You bet ${entry.amount} on {opt?.label ?? entry.optionId}
          </p>
        );
      })}

      <p>Balance: ${manager.money}</p>

      {proposition.status === 'open' && (
        <div>
          <h3>Place a Bet</h3>
          {proposition.options.map(opt => (
            <label key={opt.optionId} style={{ display: 'block', marginBottom: '0.25rem' }}>
              <input
                type="radio"
                name="betOption"
                value={opt.optionId}
                checked={selectedOption === opt.optionId}
                onChange={e => setSelectedOption(e.target.value)}
              />
              {' '}{opt.label} (${proposition.pool.byOption[opt.optionId] ?? 0})
            </label>
          ))}
          <div style={{ marginTop: '0.5rem' }}>
            <label htmlFor="betAmount">Amount: $</label>
            <input
              id="betAmount"
              type="number"
              min={1}
              step={1}
              value={amount}
              onChange={e => setAmount(parseInt(e.target.value, 10))}
            />
          </div>
          <button
            type="button"
            onClick={placeBet}
            style={{ marginTop: '0.5rem', padding: '0.5rem 1rem' }}
          >
            Place Bet
          </button>
          {betError && <p style={{ color: 'red', marginTop: '0.5rem' }}>{betError}</p>}
        </div>
      )}
    </div>
  );
}
