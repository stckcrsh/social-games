import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { inventoryApi } from '../api/meta';
import { useAuth } from '../auth/AuthContext';
import type { PlayerInventory } from '@org/shared';
import { LoadingSpinner } from '../components/LoadingSpinner';
import { ErrorMessage } from '../components/ErrorMessage';
import { RawResponse } from '../components/RawResponse';

export function InventoryPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [inv, setInv] = useState<PlayerInventory | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);

  useEffect(() => {
    inventoryApi.getMyInventory()
      .then(setInv)
      .catch(setError)
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <LoadingSpinner />;

  return (
    <div className="page">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
        <h1 style={{ margin: 0 }}>My Inventory</h1>
        {user && (
          <button
            onClick={() => navigate('/loadout')}
            style={{
              background: '#1a472a',
              color: '#4ade80',
              border: '1px solid #2d6a4f',
              padding: '0.5rem 1.25rem',
              fontFamily: 'monospace',
              fontSize: '0.9rem',
              borderRadius: '3px',
              cursor: 'pointer',
            }}
          >
            ▶ Play Dungeon Run
          </button>
        )}
      </div>

      <ErrorMessage error={error} />

      {inv && (
        <>
          <h2>Stacks</h2>
          {Object.keys(inv.stacks).length === 0 ? (
            <p>No stacks.</p>
          ) : (
            <table className="data-table">
              <thead>
                <tr><th>Def ID</th><th>Quantity</th></tr>
              </thead>
              <tbody>
                {Object.entries(inv.stacks).map(([defId, qty]) => (
                  <tr key={defId}>
                    <td>{defId}</td>
                    <td>{qty}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          <h2>Instances</h2>
          {Object.keys(inv.instances).length === 0 ? (
            <p>No instances.</p>
          ) : (
            <table className="data-table">
              <thead>
                <tr>
                  <th>Item ID</th>
                  <th>Def ID</th>
                  <th>Created</th>
                  <th>Durability</th>
                </tr>
              </thead>
              <tbody>
                {Object.values(inv.instances).map(inst => (
                  <tr key={inst.itemId}>
                    <td style={{ fontFamily: 'monospace', fontSize: '0.8rem' }}>{inst.itemId}</td>
                    <td>{inst.defId}</td>
                    <td>{new Date(inst.createdAt).toLocaleString()}</td>
                    <td>{inst.durability ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          <RawResponse data={inv} />
        </>
      )}
    </div>
  );
}
