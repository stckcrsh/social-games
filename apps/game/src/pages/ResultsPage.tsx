import { useState, useEffect, useRef } from 'react';
import { useParams, Link } from 'react-router-dom';
import { getReconcilePatch } from '../api/dungeon';
import type { ReconcilePatch } from '@org/shared';

export function ResultsPage() {
  const { runId } = useParams<{ runId: string }>();
  const [patch, setPatch] = useState<ReconcilePatch | null>(null);
  const [error, setError] = useState<string | null>(null);
  const attemptsRef = useRef(0);

  useEffect(() => {
    if (!runId) return;
    let cancelled = false;

    async function tryFetch() {
      try {
        const p = await getReconcilePatch(runId!);
        if (!cancelled) setPatch(p);
      } catch (e) {
        if (cancelled) return;
        if (attemptsRef.current < 5) {
          attemptsRef.current += 1;
          setTimeout(tryFetch, 1000);
        } else {
          setError(e instanceof Error ? e.message : 'Failed to load results');
        }
      }
    }

    tryFetch();
    return () => { cancelled = true; };
  }, [runId]);

  if (error) {
    return (
      <div style={{ padding: 32 }}>
        <p style={{ color: 'red' }}>{error}</p>
        <Link to="/inventory">Back to Inventory</Link>
      </div>
    );
  }

  if (!patch) {
    return <div style={{ padding: 32 }}>Loading results...</div>;
  }

  const won = patch.result === 'extracted';

  return (
    <div style={{ maxWidth: 600, margin: '40px auto', padding: '0 16px' }}>
      <h1 style={{ color: won ? '#22cc88' : '#cc2244' }}>
        {won ? '✓ Extracted' : '✗ Dead'}
      </h1>

      <section style={{ marginBottom: 24 }}>
        <h2>Items Lost</h2>
        {patch.consume.instances.length === 0 && Object.keys(patch.consume.stacks).length === 0
          ? <p style={{ color: '#888' }}>None</p>
          : (
            <ul>
              {patch.consume.instances.map((id) => <li key={id}>{id}</li>)}
              {Object.entries(patch.consume.stacks).map(([itemId, qty]) => (
                <li key={itemId}>{itemId} ×{qty}</li>
              ))}
            </ul>
          )
        }
      </section>

      <section style={{ marginBottom: 24 }}>
        <h2>Items Found</h2>
        {patch.grant.instances.length === 0 && Object.keys(patch.grant.stacks).length === 0
          ? <p style={{ color: '#888' }}>None</p>
          : (
            <ul>
              {patch.grant.instances.map((item, i) => (
                <li key={i}>{item.defId}{item.qty != null ? ` ×${item.qty}` : ''}</li>
              ))}
              {Object.entries(patch.grant.stacks).map(([itemId, qty]) => (
                <li key={itemId}>{itemId} ×{qty}</li>
              ))}
            </ul>
          )
        }
      </section>

      <Link to="/inventory">
        <button style={{ padding: '12px 32px', fontSize: 18, cursor: 'pointer' }}>
          Back to Inventory
        </button>
      </Link>
    </div>
  );
}
