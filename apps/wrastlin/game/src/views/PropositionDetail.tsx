import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { api, ApiError } from '../api/client.js';
import { computePool } from '../utils/pool.js';
import type { BetProposition, BetEntry, BettingState, Manager } from '@org/wrastlin-shared';

export function PropositionDetail() {
  const { id } = useParams<{ id: string }>();
  const [proposition, setProposition] = useState<BetProposition | null>(null);
  const [bettingState, setBettingState] = useState<BettingState | null>(null);
  const [manager, setManager] = useState<Manager | null>(null);
  const [allEntries, setAllEntries] = useState<BetEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedOptionId, setExpandedOptionId] = useState<string | null>(null);
  const [amount, setAmount] = useState(1);
  const [betError, setBetError] = useState('');

  async function loadData() {
    try {
      const [prop, state, { manager: m }, entries] = await Promise.all([
        api.getProposition(id!),
        api.getBettingState(),
        api.getMe(),
        api.getAllEntries(),
      ]);
      setProposition(prop);
      setBettingState(state);
      setManager(m);
      setAllEntries(entries);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (id) loadData();
  }, []);

  if (!id) return null;
  if (loading) return <p>Loading...</p>;
  if (error) return <p style={{ color: 'red' }}>Error: {error}</p>;
  if (!proposition || !manager) return null;

  const pool = computePool(allEntries, id);
  const myEntries = allEntries.filter(e => e.bettorId === manager.managerId && e.propositionId === id);
  const isOpen = bettingState?.phase === 'open';

  function toggleOption(optionId: string) {
    setExpandedOptionId(prev => (prev === optionId ? null : optionId));
    setBetError('');
    setAmount(1);
  }

  async function placeBet() {
    if (!expandedOptionId || !manager) return;
    setBetError('');
    try {
      await api.placeBet(id!, { managerId: manager.managerId, optionId: expandedOptionId, amount });
      const [prop, entries] = await Promise.all([
        api.getProposition(id!),
        api.getAllEntries(),
      ]);
      setProposition(prop);
      setAllEntries(entries);
      setExpandedOptionId(null);
    } catch (e) {
      setBetError(e instanceof ApiError ? e.serverMessage : (e as Error).message);
    }
  }

  return (
    <div style={{ padding: '1rem', maxWidth: '600px' }}>
      <h2>{proposition.statement}</h2>
      <p>Balance: ${manager.money}</p>

      {myEntries.map(entry => {
        const opt = proposition.options.find(o => o.optionId === entry.optionId);
        return (
          <p key={entry.entryId}>
            You bet ${entry.amount} on {opt?.label ?? entry.optionId}
          </p>
        );
      })}

      <h3>Options</h3>
      <ul style={{ listStyle: 'none', padding: 0 }}>
        {proposition.options.map(opt => {
          const isWinner = proposition.judgement?.winningOptionIds.includes(opt.optionId);
          const isExpanded = expandedOptionId === opt.optionId;
          const label = `${opt.label}${isWinner ? ' (winner)' : ''} — $${pool.byOption[opt.optionId] ?? 0} in pool`;
          return (
            <li key={opt.optionId} style={{ marginBottom: '0.5rem' }}>
              {isOpen ? (
                <button
                  type="button"
                  onClick={() => toggleOption(opt.optionId)}
                  style={{ textAlign: 'left', background: 'none', border: '1px solid #ccc', cursor: 'pointer', padding: '0.25rem 0.5rem', width: '100%' }}
                >
                  {label}
                </button>
              ) : (
                <span>{label}</span>
              )}
              {isExpanded && (
                <div style={{ marginTop: '0.25rem', paddingLeft: '0.5rem' }}>
                  <label htmlFor={`amount-${opt.optionId}`}>Amount: $</label>
                  <input
                    id={`amount-${opt.optionId}`}
                    type="number"
                    min={1}
                    step={1}
                    value={amount}
                    onChange={e => setAmount(parseInt(e.target.value, 10))}
                  />
                  <button type="button" onClick={placeBet} style={{ marginLeft: '0.5rem' }}>
                    Place Bet
                  </button>
                  {betError && <p style={{ color: 'red', marginTop: '0.25rem' }}>{betError}</p>}
                </div>
              )}
            </li>
          );
        })}
      </ul>

      {proposition.judgement && (
        <div style={{ marginTop: '1rem', padding: '0.5rem', background: '#f9f9f9' }}>
          <strong>Judge's ruling:</strong>
          <p style={{ margin: '0.25rem 0', fontStyle: 'italic' }}>{proposition.judgement.rationale}</p>
        </div>
      )}
    </div>
  );
}
