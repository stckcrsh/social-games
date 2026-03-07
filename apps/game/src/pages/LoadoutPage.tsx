import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { inventoryApi } from '../api/meta';
import { createRun } from '../api/dungeon';
import type { PlayerInventory } from '@org/shared';

export function LoadoutPage() {
  const { user } = useAuth();
  const navigate = useNavigate();

  const [inventory, setInventory] = useState<PlayerInventory | null>(null);
  const [slotA, setSlotA] = useState<string>('');
  const [slotB, setSlotB] = useState<string>('');
  const [ammoItemId, setAmmoItemId] = useState<string>('');
  const [ammoQty, setAmmoQty] = useState(5);
  const [loading, setLoading] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [startError, setStartError] = useState<string | null>(null);

  // Fetch inventory on mount
  useEffect(() => {
    inventoryApi.getMyInventory()
      .then(setInventory)
      .catch((e: unknown) => setFetchError(e instanceof Error ? e.message : 'Failed to load inventory'));
  }, []);

  // Derive items list from inventory instances and stacks
  const ownedInstances = inventory
    ? Object.values(inventory.instances ?? {}).map((inst) => ({
        itemId: inst.itemId,
        label: `${inst.defId} (instance)`,
        qty: 1,
      }))
    : [];

  const ownedStacks = inventory
    ? Object.entries(inventory.stacks ?? {})
        .filter(([, qty]) => qty > 0)
        .map(([defId, qty]) => ({ itemId: defId, label: `${defId} ×${qty}`, qty }))
    : [];

  const ownedItems = [...ownedInstances, ...ownedStacks];

  async function handleStart() {
    setLoading(true);
    setStartError(null);
    try {
      const inventoryMap: Record<string, number> = {};
      if (ammoItemId && ammoQty > 0) {
        inventoryMap[ammoItemId] = ammoQty;
      }

      const { runId } = await createRun({
        preset: 'open',
        profile: {
          inventory: inventoryMap,
          loadout: {
            slotA: slotA || null,
            slotB: slotB || null,
            activeSlot: 'A',
          },
        },
        metaMode: 'bypass',
        playerId: user?.playerId,
      });
      navigate(`/game/${runId}`);
    } catch (e: unknown) {
      setStartError(e instanceof Error ? e.message : 'Failed to start run');
    } finally {
      setLoading(false);
    }
  }

  if (fetchError) {
    return <div style={{ padding: 32 }}><p style={{ color: 'red' }}>{fetchError}</p></div>;
  }

  if (!inventory) {
    return <div style={{ padding: 32 }}>Loading inventory...</div>;
  }

  return (
    <div style={{ maxWidth: 600, margin: '40px auto', padding: '0 16px' }}>
      <h1>Choose Loadout</h1>
      <p>Select items to bring into the dungeon. They will be at risk.</p>

      {startError && <p style={{ color: 'red' }}>{startError}</p>}

      <div style={{ marginBottom: 16 }}>
        <label>
          <strong>Slot A:</strong>
          <select
            value={slotA}
            onChange={(e) => setSlotA(e.target.value)}
            style={{ marginLeft: 8 }}
          >
            <option value="">— None —</option>
            {ownedItems.map(({ itemId, label }) => (
              <option key={itemId} value={itemId}>{label}</option>
            ))}
          </select>
        </label>
      </div>

      <div style={{ marginBottom: 16 }}>
        <label>
          <strong>Slot B:</strong>
          <select
            value={slotB}
            onChange={(e) => setSlotB(e.target.value)}
            style={{ marginLeft: 8 }}
          >
            <option value="">— None —</option>
            {ownedItems.map(({ itemId, label }) => (
              <option key={itemId} value={itemId}>{label}</option>
            ))}
          </select>
        </label>
      </div>

      <div style={{ marginBottom: 16 }}>
        <label>
          <strong>Ammo Item:</strong>
          <select
            value={ammoItemId}
            onChange={(e) => setAmmoItemId(e.target.value)}
            style={{ marginLeft: 8 }}
          >
            <option value="">— None —</option>
            {ownedStacks.map(({ itemId, label }) => (
              <option key={itemId} value={itemId}>{label}</option>
            ))}
          </select>
        </label>
      </div>

      {ammoItemId && (
        <div style={{ marginBottom: 16 }}>
          <label>
            <strong>Ammo Qty:</strong>
            <input
              type="number"
              min={1}
              max={ownedStacks.find((i) => i.itemId === ammoItemId)?.qty ?? 99}
              value={ammoQty}
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
        {loading ? 'Starting...' : 'Confirm & Enter Run'}
      </button>

      <button
        onClick={() => navigate('/inventory')}
        disabled={loading}
        style={{ marginTop: 24, marginLeft: 16, padding: '12px 24px', fontSize: 16, cursor: 'pointer' }}
      >
        Back
      </button>
    </div>
  );
}
