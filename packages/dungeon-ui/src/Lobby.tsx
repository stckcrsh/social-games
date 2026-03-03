import { useState } from 'react';
import { createRun } from './api';
import type { RunState } from './types';

const PRESETS = [
  { value: 'default', label: 'default — 20×20, room + 3 enemies (chaser / patrol / charger)' },
  { value: 'open',    label: 'open    — 20×20, sparse walls, 2 chasers' },
  { value: 'maze',    label: 'maze    — 20×20, dense corridors, 2 enemies' },
];

interface LobbyProps {
  onStart: (runId: string, state: RunState, render: string, preset: string) => void;
}

export function Lobby({ onStart }: LobbyProps) {
  const [preset, setPreset] = useState('default');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleStart() {
    setLoading(true);
    setError(null);
    try {
      const { runId, state, render } = await createRun(preset);
      onStart(runId, state, render, preset);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ fontFamily: 'monospace', padding: '2rem', color: '#ccc' }}>
      <h1 style={{ color: '#00ffff', marginBottom: '1.5rem' }}>Dungeon Engine</h1>

      <fieldset style={{ border: '1px solid #444', padding: '1rem', marginBottom: '1.5rem' }}>
        <legend style={{ color: '#888' }}>Choose preset</legend>
        {PRESETS.map((p) => (
          <label key={p.value} style={{ display: 'block', marginBottom: '0.5rem', cursor: 'pointer' }}>
            <input
              type="radio"
              name="preset"
              value={p.value}
              checked={preset === p.value}
              onChange={() => setPreset(p.value)}
              style={{ marginRight: '0.5rem' }}
            />
            {p.label}
          </label>
        ))}
      </fieldset>

      <button
        onClick={handleStart}
        disabled={loading}
        style={{
          background: '#00ff00',
          color: '#000',
          border: 'none',
          padding: '0.5rem 1.5rem',
          fontFamily: 'monospace',
          fontSize: '1rem',
          cursor: loading ? 'not-allowed' : 'pointer',
          opacity: loading ? 0.6 : 1,
        }}
      >
        {loading ? 'Starting…' : 'Start Game'}
      </button>

      {error && (
        <p style={{ color: '#ff4444', marginTop: '1rem' }}>Error: {error}</p>
      )}
    </div>
  );
}
