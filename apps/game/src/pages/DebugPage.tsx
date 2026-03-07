import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ITEM_DEFS } from '@org/items';
import { createRun } from '../api/dungeon';

// All preset IDs accepted by the server (from CreateRunSchema)
const PRESET_IDS = [
  'default', 'open', 'maze', 'oil_trap', 'terminal_door',
  'fire_stress', 'mine_chain', 'ai_maze_regression', 'kill_room', 'exit_room',
];

const ITEM_OPTIONS = Object.values(ITEM_DEFS).map((def) => ({ id: def.id, name: def.name }));

export function DebugPage() {
  // Guard: only render in dev
  if (!import.meta.env.DEV) {
    return <div style={{ padding: 32 }}><p>Debug page not available in production.</p></div>;
  }

  const navigate = useNavigate();
  const [preset, setPreset] = useState('open');
  const [slotA, setSlotA] = useState('');
  const [slotB, setSlotB] = useState('');
  const [ammoItemId, setAmmoItemId] = useState('');
  const [ammoQty, setAmmoQty] = useState(10);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleStart() {
    setError(null);
    setLoading(true);
    try {
      const { runId } = await createRun({
        preset,
        profile: {
          inventory: ammoItemId && ammoQty > 0 ? { [ammoItemId]: ammoQty } : {},
          loadout: {
            slotA: slotA || null,
            slotB: slotB || null,
            activeSlot: 'A',
          },
        },
        debug: true,
        metaMode: 'bypass',
      });
      navigate(`/game/${runId}?debug=true`);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to start debug run');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ maxWidth: 500, margin: '40px auto', padding: '0 16px' }}>
      <h1>Debug Launcher</h1>
      <p style={{ color: '#aaa' }}>Dev only — bypasses inventory and escrow. Run starts immediately (no pending state).</p>
      {error && <p style={{ color: 'red' }}>{error}</p>}

      <div style={{ marginBottom: 12 }}>
        <label>
          <strong>Preset:</strong>
          <select value={preset} onChange={(e) => setPreset(e.target.value)} style={{ marginLeft: 8 }}>
            {PRESET_IDS.map((id) => <option key={id} value={id}>{id}</option>)}
          </select>
        </label>
      </div>

      <div style={{ marginBottom: 12 }}>
        <label>
          <strong>Slot A:</strong>
          <select value={slotA} onChange={(e) => setSlotA(e.target.value)} style={{ marginLeft: 8 }}>
            <option value="">— None —</option>
            {ITEM_OPTIONS.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
          </select>
        </label>
      </div>

      <div style={{ marginBottom: 12 }}>
        <label>
          <strong>Slot B:</strong>
          <select value={slotB} onChange={(e) => setSlotB(e.target.value)} style={{ marginLeft: 8 }}>
            <option value="">— None —</option>
            {ITEM_OPTIONS.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
          </select>
        </label>
      </div>

      <div style={{ marginBottom: 12 }}>
        <label>
          <strong>Ammo Item:</strong>
          <select value={ammoItemId} onChange={(e) => setAmmoItemId(e.target.value)} style={{ marginLeft: 8 }}>
            <option value="">— None —</option>
            {ITEM_OPTIONS.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
          </select>
        </label>
      </div>

      {ammoItemId && (
        <div style={{ marginBottom: 12 }}>
          <label>
            <strong>Ammo Qty:</strong>
            <input
              type="number" min={1} max={99} value={ammoQty}
              onChange={(e) => setAmmoQty(Number(e.target.value))}
              style={{ marginLeft: 8, width: 80 }}
            />
          </label>
        </div>
      )}

      <button
        onClick={handleStart}
        disabled={loading}
        style={{ marginTop: 24, padding: '12px 32px', fontSize: 18, cursor: 'pointer' }}
      >
        {loading ? 'Launching...' : 'Launch Debug Run'}
      </button>
    </div>
  );
}
